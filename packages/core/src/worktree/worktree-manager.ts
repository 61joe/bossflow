import { access, mkdir, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { WorktreeMetadata } from '../contracts/index.js';
import { RUN_ID_PATTERN } from '../contracts/index.js';
import {
  DEFAULT_DIRTY_WORKTREE_STRATEGY,
  DEFAULT_WORKTREE_ROOT_DIRECTORY,
  SENSITIVE_WORKTREE_PATH_PATTERNS,
  WORKTREE_BRANCH_PREFIX,
  WORKTREE_LOCKS_DIRECTORY,
} from './constant.js';
import { SimpleGitWorktreeOperations } from './git-worktree-operations.js';
import { WorktreeLock } from './worktree-lock.js';
import type {
  CleanupWorktreeOptions,
  CreateWorktreeOptions,
  GitWorktreeInfo,
  GitWorktreeOperations,
  WorktreeDiff,
  WorktreeGitStatus,
  WorktreeListOptions,
  WorktreeManagerOptions,
} from './types.js';

export class GitWorktreeManager {
  readonly #defaultManagedRoot: string | undefined;
  readonly #defaultDirtyStrategy;
  readonly #operations: GitWorktreeOperations;
  readonly #lock: WorktreeLock;

  constructor(options: WorktreeManagerOptions = {}) {
    this.#defaultManagedRoot = options.managedRoot;
    this.#defaultDirtyStrategy = options.dirtyStrategy ?? DEFAULT_DIRTY_WORKTREE_STRATEGY;
    this.#operations = options.operations ?? new SimpleGitWorktreeOperations();
    this.#lock = new WorktreeLock(options);
  }

  async readStatus(repositoryPath: string): Promise<WorktreeGitStatus> {
    return this.#operations.readStatus(path.resolve(repositoryPath));
  }

  async create(options: CreateWorktreeOptions): Promise<WorktreeMetadata> {
    assertRunId(options.runId);
    const repositoryPath = path.resolve(options.repositoryPath);
    const baseCommit = await this.#operations.resolveRevision(
      repositoryPath,
      options.baseRef ?? 'HEAD',
    );
    assertCommit(baseCommit);

    const branch = `${WORKTREE_BRANCH_PREFIX}${options.runId}`;
    const managedRoot = this.#resolveManagedRoot(repositoryPath, options.managedRoot);
    await mkdir(managedRoot, { recursive: true });
    const canonicalManagedRoot = await realpath(managedRoot);
    const worktreePath = path.join(canonicalManagedRoot, options.runId);
    const createdAt = options.createdAt ?? options.now ?? new Date().toISOString();
    return this.#lock.withLock(canonicalManagedRoot, options.runId, () =>
      this.#createLocked({
        baseCommit,
        branch,
        createdAt,
        dirtyStrategy: options.dirtyStrategy ?? this.#defaultDirtyStrategy,
        repositoryPath,
        worktreePath,
      }),
    );
  }

  async #createLocked(options: {
    readonly baseCommit: string;
    readonly branch: string;
    readonly createdAt: string;
    readonly dirtyStrategy: 'reject' | 'use-head';
    readonly repositoryPath: string;
    readonly worktreePath: string;
  }): Promise<WorktreeMetadata> {
    const existing = (await this.#operations.listWorktrees(options.repositoryPath)).find(
      (worktree) => worktree.path === options.worktreePath,
    );

    if (existing !== undefined) {
      assertExistingWorktree(existing, options.branch, options.baseCommit);
      return {
        path: options.worktreePath,
        branch: options.branch,
        baseCommit: options.baseCommit,
        createdAt: options.createdAt,
        status: 'active',
      };
    }

    const status = await this.#operations.readStatus(options.repositoryPath);
    if (status.isDirty && options.dirtyStrategy === 'reject') {
      throw new Error(
        'The main working tree has uncommitted changes. Commit or stash them before creating a run worktree.',
      );
    }

    if (await pathExists(options.worktreePath)) {
      throw new Error(
        `Worktree path "${options.worktreePath}" exists but is not registered with Git.`,
      );
    }

    const branchExists = await this.#operations.branchExists(
      options.repositoryPath,
      options.branch,
    );
    if (branchExists) {
      const branchCommit = await this.#operations.resolveRevision(
        options.repositoryPath,
        options.branch,
      );
      if (branchCommit !== options.baseCommit) {
        throw new Error(
          `Existing worktree branch "${options.branch}" does not point at the requested base commit.`,
        );
      }
    }
    await this.#operations.addWorktree({
      repositoryPath: options.repositoryPath,
      worktreePath: options.worktreePath,
      branch: options.branch,
      baseCommit: options.baseCommit,
      createBranch: !branchExists,
    });
    return {
      path: options.worktreePath,
      branch: options.branch,
      baseCommit: options.baseCommit,
      createdAt: options.createdAt,
      status: 'active',
    };
  }

  async collectDiff(metadata: WorktreeMetadata): Promise<WorktreeDiff> {
    const changed = await this.#operations.changedPaths(metadata.path, metadata.baseCommit);
    const trackedPaths = unique(changed.tracked);
    const untrackedPaths = unique(changed.untracked);
    const changedPaths = unique([...trackedPaths, ...untrackedPaths]).sort();
    const sensitivePaths = changedPaths.filter(isSensitivePath);
    const sensitivePathSet = new Set(sensitivePaths);
    const safeTrackedPaths = trackedPaths.filter((entry) => !sensitivePathSet.has(entry));
    const safeUntrackedPaths = untrackedPaths.filter((entry) => !sensitivePathSet.has(entry));
    const patch = await this.#operations.createPatch({
      worktreePath: metadata.path,
      baseCommit: metadata.baseCommit,
      trackedPaths: safeTrackedPaths,
      untrackedPaths: safeUntrackedPaths,
    });
    return {
      trackedPaths,
      untrackedPaths,
      changedPaths,
      sensitivePaths,
      patch,
    };
  }

  async cleanup(
    repositoryPath: string,
    metadata: WorktreeMetadata,
    options: CleanupWorktreeOptions = {},
  ): Promise<WorktreeMetadata> {
    const managedRoot = await canonicalizeExistingPath(path.dirname(metadata.path));
    return this.#lock.withLock(managedRoot, path.basename(metadata.path), async () => {
      const canonicalWorktreePath = await canonicalizeExistingPath(metadata.path);
      const worktrees = await this.#operations.listWorktrees(path.resolve(repositoryPath));
      if (worktrees.some((worktree) => worktree.path === canonicalWorktreePath)) {
        await this.#operations.removeWorktree(
          path.resolve(repositoryPath),
          canonicalWorktreePath,
          options.force === true,
        );
      }
      await this.#operations.pruneWorktrees(path.resolve(repositoryPath));
      if (
        options.deleteBranch === true &&
        (await this.#operations.branchExists(path.resolve(repositoryPath), metadata.branch))
      ) {
        await this.#operations.deleteBranch(path.resolve(repositoryPath), metadata.branch);
      }
      return {
        ...metadata,
        path: canonicalWorktreePath,
        status: 'cleaned',
        cleanedAt: options.now ?? new Date().toISOString(),
      };
    });
  }

  async listManaged(options: WorktreeListOptions): Promise<readonly GitWorktreeInfo[]> {
    const managedRoot = this.#resolveManagedRoot(
      path.resolve(options.repositoryPath),
      options.managedRoot,
    );
    const canonicalManagedRoot = await canonicalizeExistingPath(managedRoot);
    const worktrees = await this.#operations.listWorktrees(path.resolve(options.repositoryPath));
    return worktrees.filter((worktree) => isPathInside(canonicalManagedRoot, worktree.path));
  }

  async findOrphans(options: WorktreeListOptions): Promise<readonly string[]> {
    const repositoryPath = path.resolve(options.repositoryPath);
    const managedRoot = await canonicalizeExistingPath(
      this.#resolveManagedRoot(repositoryPath, options.managedRoot),
    );
    let entries: string[];
    try {
      entries = (await readdir(managedRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name !== WORKTREE_LOCKS_DIRECTORY)
        .map((entry) => path.join(managedRoot, entry.name));
    } catch (error: unknown) {
      if (isFileMissingError(error)) {
        return [];
      }
      throw error;
    }
    const worktreePaths = new Set(
      (await this.#operations.listWorktrees(repositoryPath)).map((worktree) =>
        path.resolve(worktree.path),
      ),
    );
    return entries.filter((entry) => !worktreePaths.has(path.resolve(entry))).sort();
  }

  #resolveManagedRoot(repositoryPath: string, managedRoot: string | undefined): string {
    const configuredRoot = managedRoot ?? this.#defaultManagedRoot;
    if (configuredRoot !== undefined) {
      return path.resolve(configuredRoot);
    }
    return path.join(
      path.dirname(repositoryPath),
      DEFAULT_WORKTREE_ROOT_DIRECTORY,
      path.basename(repositoryPath),
    );
  }
}

export async function canonicalizeExistingPath(targetPath: string): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch (error: unknown) {
    if (isFileMissingError(error)) {
      return path.resolve(targetPath);
    }
    throw error;
  }
}

function assertExistingWorktree(
  worktree: GitWorktreeInfo,
  expectedBranch: string,
  expectedCommit: string,
): void {
  if (worktree.branch !== expectedBranch) {
    throw new Error(
      `Registered worktree uses branch "${worktree.branch ?? '(detached)'}" instead of "${expectedBranch}".`,
    );
  }
  if (worktree.head !== expectedCommit) {
    throw new Error(
      `Registered worktree is at commit ${worktree.head} instead of ${expectedCommit}.`,
    );
  }
}

function assertRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Invalid run ID for worktree: "${runId}".`);
  }
}

function assertCommit(commit: string): void {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(commit)) {
    throw new Error(`Git returned an invalid commit identifier: "${commit}".`);
  }
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch (error: unknown) {
    if (isFileMissingError(error)) {
      return false;
    }
    throw error;
  }
}

function isSensitivePath(fileName: string): boolean {
  return SENSITIVE_WORKTREE_PATH_PATTERNS.some((pattern) => pattern.test(fileName));
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isFileMissingError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
