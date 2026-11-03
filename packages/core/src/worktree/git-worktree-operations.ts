import { createHash } from 'node:crypto';
import path from 'node:path';

import { execa } from 'execa';
import { simpleGit } from 'simple-git';

import { MAX_WORKTREE_PATCH_BYTES, WORKTREE_BRANCH_REF_PREFIX } from './constant.js';
import type { GitWorktreeInfo, GitWorktreeOperations, WorktreeGitStatus } from './types.js';

export class SimpleGitWorktreeOperations implements GitWorktreeOperations {
  async resolveRevision(repositoryPath: string, revision: string): Promise<string> {
    return (await simpleGit(repositoryPath).raw(['rev-parse', revision])).trim();
  }

  async readStatus(repositoryPath: string): Promise<WorktreeGitStatus> {
    const git = simpleGit(repositoryPath);
    const [status, head, branch] = await Promise.all([
      git.raw(['status', '--porcelain=v1', '-z']),
      git.raw(['rev-parse', 'HEAD']),
      git.raw(['rev-parse', '--abbrev-ref', 'HEAD']),
    ]);
    return {
      isDirty: status.length > 0,
      fingerprint: createHash('sha256')
        .update(`${status}\0${head.trim()}\0${branch.trim()}`)
        .digest('hex'),
    };
  }

  async listWorktrees(repositoryPath: string): Promise<readonly GitWorktreeInfo[]> {
    const output = await simpleGit(repositoryPath).raw(['worktree', 'list', '--porcelain']);
    return parseWorktreeList(output);
  }

  async branchExists(repositoryPath: string, branch: string): Promise<boolean> {
    const output = await simpleGit(repositoryPath).raw(['branch', '--list', branch]);
    return output.trim().length > 0;
  }

  async addWorktree(options: {
    readonly repositoryPath: string;
    readonly worktreePath: string;
    readonly branch: string;
    readonly baseCommit: string;
    readonly createBranch: boolean;
  }): Promise<void> {
    const args = options.createBranch
      ? ['worktree', 'add', '-b', options.branch, options.worktreePath, options.baseCommit]
      : ['worktree', 'add', options.worktreePath, options.branch];
    await simpleGit(options.repositoryPath).raw(args);
  }

  async changedPaths(
    worktreePath: string,
    baseCommit: string,
  ): Promise<{ readonly tracked: readonly string[]; readonly untracked: readonly string[] }> {
    const git = simpleGit(worktreePath);
    const trackedOutput = await git.raw(['diff', '--name-only', '-z', baseCommit, '--']);
    const untrackedOutput = await git.raw(['ls-files', '--others', '--exclude-standard', '-z']);
    return {
      tracked: parseNullSeparatedPaths(trackedOutput),
      untracked: parseNullSeparatedPaths(untrackedOutput),
    };
  }

  async createPatch(options: {
    readonly worktreePath: string;
    readonly baseCommit: string;
    readonly trackedPaths: readonly string[];
    readonly untrackedPaths: readonly string[];
  }): Promise<string> {
    const git = simpleGit(options.worktreePath);
    let patch =
      options.trackedPaths.length === 0
        ? ''
        : await git.raw(['diff', '--binary', options.baseCommit, '--', ...options.trackedPaths]);
    for (const untrackedPath of options.untrackedPaths) {
      const result = await execa(
        'git',
        ['diff', '--no-index', '--binary', '--', '/dev/null', untrackedPath],
        {
          cwd: options.worktreePath,
          reject: false,
        },
      );
      assertNoIndexExitCode(result.exitCode, untrackedPath);
      patch += result.stdout;
      assertPatchSize(patch);
    }
    assertPatchSize(patch);
    return patch;
  }

  async removeWorktree(
    repositoryPath: string,
    worktreePath: string,
    force: boolean,
  ): Promise<void> {
    await simpleGit(repositoryPath).raw([
      'worktree',
      'remove',
      ...(force ? ['--force'] : []),
      worktreePath,
    ]);
  }

  async deleteBranch(repositoryPath: string, branch: string): Promise<void> {
    await simpleGit(repositoryPath).raw(['branch', '-D', branch]);
  }

  async pruneWorktrees(repositoryPath: string): Promise<void> {
    await simpleGit(repositoryPath).raw(['worktree', 'prune']);
  }
}

export function parseWorktreeList(output: string): GitWorktreeInfo[] {
  return output
    .trim()
    .split(/\n\n/)
    .filter((block) => block.length > 0)
    .map((block, index) => {
      const fields = new Map(
        block.split('\n').map((line) => {
          const separator = line.indexOf(' ');
          return separator === -1
            ? [line, '']
            : [line.slice(0, separator), line.slice(separator + 1)];
        }),
      );
      const worktreePath = fields.get('worktree');
      const head = fields.get('HEAD');
      if (worktreePath === undefined || head === undefined) {
        throw new Error('Git returned malformed worktree metadata.');
      }
      const branchRef = fields.get('branch');
      return {
        path: path.resolve(worktreePath),
        head,
        ...(branchRef === undefined
          ? {}
          : { branch: branchRef.replace(WORKTREE_BRANCH_REF_PREFIX, '') }),
        isMain: index === 0,
      };
    });
}

function parseNullSeparatedPaths(output: string): string[] {
  return output
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.replaceAll('\\', '/'));
}

export function assertPatchSize(patch: string): void {
  if (Buffer.byteLength(patch) > MAX_WORKTREE_PATCH_BYTES) {
    throw new Error(`Implementation patch exceeds ${MAX_WORKTREE_PATCH_BYTES} bytes.`);
  }
}

export function assertNoIndexExitCode(exitCode: number | undefined, fileName: string): void {
  if (exitCode !== 0 && exitCode !== 1) {
    throw new Error(`Unable to create a patch for untracked file "${fileName}".`);
  }
}
