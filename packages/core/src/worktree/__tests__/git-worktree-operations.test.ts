import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { simpleGit } from 'simple-git';

import { SimpleGitWorktreeOperations } from '../index.js';
import {
  assertPatchSize,
  assertNoIndexExitCode,
  parseWorktreeList,
} from '../git-worktree-operations.js';

describe('SimpleGitWorktreeOperations', () => {
  it('creates, inspects, patches, and cleans a worktree', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-worktree-ops-'));
    const managedRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-worktree-managed-'));
    const worktreePath = path.join(managedRoot, 'run-1');
    const worktreeBranch = 'bossflow/run-1';

    try {
      const git = simpleGit(projectRoot);
      await git.init(['--initial-branch=main']);
      await git.raw(['config', 'user.name', 'BossFlow Test']);
      await git.raw(['config', 'user.email', 'bossflow@example.com']);
      await writeFile(path.join(projectRoot, 'README.md'), 'initial\n', 'utf8');
      await git.add(['README.md']);
      await git.commit('Initial commit');

      const operations = new SimpleGitWorktreeOperations();
      const head = await operations.resolveRevision(projectRoot, 'HEAD');
      expect(head).toMatch(/^[a-f0-9]{40}$/);
      await expect(operations.readStatus(projectRoot)).resolves.toMatchObject({
        isDirty: false,
      });
      await expect(operations.branchExists(projectRoot, worktreeBranch)).resolves.toBe(false);
      expect(await operations.listWorktrees(projectRoot)).toEqual([
        expect.objectContaining({
          path: await realProjectPath(projectRoot),
          head,
          branch: 'main',
          isMain: true,
        }),
      ]);

      await operations.addWorktree({
        repositoryPath: projectRoot,
        worktreePath,
        branch: worktreeBranch,
        baseCommit: head,
        createBranch: true,
      });
      await expect(operations.branchExists(projectRoot, worktreeBranch)).resolves.toBe(true);
      expect(await operations.listWorktrees(projectRoot)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: await realProjectPath(worktreePath),
            branch: worktreeBranch,
          }),
        ]),
      );

      await writeFile(path.join(worktreePath, 'README.md'), 'changed\n', 'utf8');
      await writeFile(path.join(worktreePath, 'new.txt'), 'new file\n', 'utf8');
      await writeFile(path.join(projectRoot, 'dirty.txt'), 'dirty\n', 'utf8');
      await expect(operations.readStatus(projectRoot)).resolves.toMatchObject({
        isDirty: true,
      });

      const changed = await operations.changedPaths(worktreePath, head);
      expect(changed).toEqual({
        tracked: ['README.md'],
        untracked: ['new.txt'],
      });
      await expect(
        operations.createPatch({
          worktreePath,
          baseCommit: head,
          trackedPaths: [],
          untrackedPaths: [],
        }),
      ).resolves.toBe('');
      const patch = await operations.createPatch({
        worktreePath,
        baseCommit: head,
        trackedPaths: changed.tracked,
        untrackedPaths: changed.untracked,
      });
      expect(patch).toContain('+changed');
      expect(patch).toContain('+new file');

      await operations.removeWorktree(projectRoot, worktreePath, true);
      await operations.addWorktree({
        repositoryPath: projectRoot,
        worktreePath,
        branch: worktreeBranch,
        baseCommit: head,
        createBranch: false,
      });
      await operations.removeWorktree(projectRoot, worktreePath, false);
      await operations.deleteBranch(projectRoot, worktreeBranch);
      await operations.pruneWorktrees(projectRoot);
      await expect(operations.branchExists(projectRoot, worktreeBranch)).resolves.toBe(false);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(managedRoot, { recursive: true, force: true });
    }
  });

  it('parses detached worktrees and rejects malformed metadata', () => {
    expect(
      parseWorktreeList(
        'worktree /tmp/main\nHEAD abc123\ndetached\n\nworktree /tmp/linked\nHEAD def456\nbranch refs/heads/feature\n',
      ),
    ).toEqual([
      {
        path: '/tmp/main',
        head: 'abc123',
        isMain: true,
      },
      {
        path: '/tmp/linked',
        head: 'def456',
        branch: 'feature',
        isMain: false,
      },
    ]);
    expect(() => parseWorktreeList('HEAD abc123\n')).toThrow('malformed');
    expect(() => assertPatchSize('x'.repeat(4 * 1024 * 1024 + 1))).toThrow('exceeds');
    expect(() => assertNoIndexExitCode(2, 'broken.txt')).toThrow('Unable to create a patch');
    expect(() => assertNoIndexExitCode(1, 'changed.txt')).not.toThrow();
  });
});

async function realProjectPath(projectPath: string): Promise<string> {
  const { realpath } = await import('node:fs/promises');
  return realpath(projectPath);
}
