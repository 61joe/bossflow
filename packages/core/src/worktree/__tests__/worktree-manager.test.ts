import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { GitWorktreeManager } from '../index.js';
import { canonicalizeExistingPath, pathExists } from '../worktree-manager.js';
import { WORKTREE_LOCKS_DIRECTORY } from '../constant.js';
import { FakeWorktreeOperations } from './support/fake-worktree-operations.js';

const NOW = '2026-11-03T00:00:00.000Z';

describe('GitWorktreeManager creation', () => {
  it('creates an idempotent worktree and reuses its metadata', async () => {
    const projectRoot = await tempDirectory('bossflow-manager-project-');
    const managedRoot = await tempDirectory('bossflow-manager-root-');
    const canonicalManagedRoot = await realpath(managedRoot);
    const operations = new FakeWorktreeOperations();

    try {
      const manager = new GitWorktreeManager({ operations });
      const created = await manager.create({
        runId: 'run-1',
        repositoryPath: projectRoot,
        managedRoot,
        now: NOW,
      });
      const reused = await manager.create({
        runId: 'run-1',
        repositoryPath: projectRoot,
        managedRoot,
        baseRef: created.baseCommit,
        createdAt: created.createdAt,
      });

      expect(created).toEqual({
        path: path.join(canonicalManagedRoot, 'run-1'),
        branch: 'bossflow/run-run-1',
        baseCommit: operations.head,
        createdAt: NOW,
        status: 'active',
      });
      expect(reused).toEqual(created);
      expect(operations.added).toHaveLength(1);
    } finally {
      await removeDirectories(projectRoot, managedRoot);
    }
  });

  it('uses the default managed root and status bridge', async () => {
    const projectRoot = await tempDirectory('bossflow-manager-default-');
    const operations = new FakeWorktreeOperations();
    const managedRoot = path.join(
      path.dirname(projectRoot),
      '.bossflow-worktrees',
      path.basename(projectRoot),
    );
    const canonicalManagedRoot = path.join(
      await realpath(path.dirname(projectRoot)),
      '.bossflow-worktrees',
      path.basename(projectRoot),
    );

    try {
      const manager = new GitWorktreeManager({ operations });
      const created = await manager.create({
        runId: 'default-run',
        repositoryPath: projectRoot,
        now: NOW,
      });
      await expect(manager.readStatus(projectRoot)).resolves.toEqual(operations.status);
      expect(created.path).toBe(path.join(canonicalManagedRoot, 'default-run'));
      expect(new GitWorktreeManager()).toBeInstanceOf(GitWorktreeManager);
    } finally {
      await removeDirectories(projectRoot, managedRoot);
    }
  });

  it('rejects dirty repositories and allows use-head explicitly', async () => {
    const projectRoot = await tempDirectory('bossflow-manager-dirty-');
    const managedRoot = await tempDirectory('bossflow-manager-dirty-root-');
    const operations = new FakeWorktreeOperations();
    operations.status = { isDirty: true, fingerprint: 'dirty' };

    try {
      const manager = new GitWorktreeManager({ operations });
      await expect(
        manager.create({ runId: 'run-1', repositoryPath: projectRoot, managedRoot }),
      ).rejects.toThrow('uncommitted changes');
      await expect(
        manager.create({
          runId: 'run-1',
          repositoryPath: projectRoot,
          managedRoot,
          dirtyStrategy: 'use-head',
        }),
      ).resolves.toMatchObject({ status: 'active' });
    } finally {
      await removeDirectories(projectRoot, managedRoot);
    }
  });

  it('attaches an existing matching branch without recreating it', async () => {
    const projectRoot = await tempDirectory('bossflow-manager-branch-');
    const managedRoot = await tempDirectory('bossflow-manager-branch-root-');
    const operations = new FakeWorktreeOperations();
    operations.branches.add('bossflow/run-run-1');

    try {
      await new GitWorktreeManager({ operations }).create({
        runId: 'run-1',
        repositoryPath: projectRoot,
        managedRoot,
      });
      expect(operations.added[0]).toMatchObject({ createBranch: false });
    } finally {
      await removeDirectories(projectRoot, managedRoot);
    }
  });
});

describe('GitWorktreeManager locking', () => {
  it('serializes concurrent creation for the same run', async () => {
    const projectRoot = await tempDirectory('bossflow-manager-concurrent-');
    const managedRoot = await tempDirectory('bossflow-manager-concurrent-root-');
    const operations = new FakeWorktreeOperations();
    const manager = new GitWorktreeManager({ operations });

    try {
      await Promise.all([
        manager.create({ runId: 'run-1', repositoryPath: projectRoot, managedRoot }),
        manager.create({ runId: 'run-1', repositoryPath: projectRoot, managedRoot }),
      ]);
      expect(operations.added).toHaveLength(1);
    } finally {
      await removeDirectories(projectRoot, managedRoot);
    }
  });

  it('times out on fresh locks and recovers stale locks', async () => {
    const projectRoot = await tempDirectory('bossflow-manager-lock-');
    const managedRoot = await tempDirectory('bossflow-manager-lock-root-');
    const canonicalManagedRoot = await realpath(managedRoot);
    const locksRoot = path.join(canonicalManagedRoot, WORKTREE_LOCKS_DIRECTORY);
    const lockPath = path.join(locksRoot, 'run-1.lock');
    const operations = new FakeWorktreeOperations();

    try {
      await mkdir(lockPath, { recursive: true });
      await expect(
        new GitWorktreeManager({
          operations,
          lockTimeoutMs: 5,
          lockRetryDelayMs: 1,
          lockStaleMs: 60_000,
        }).create({ runId: 'run-1', repositoryPath: projectRoot, managedRoot }),
      ).rejects.toThrow('Timed out');

      await utimes(lockPath, new Date(0), new Date(0));
      await expect(
        new GitWorktreeManager({
          operations,
          lockTimeoutMs: 5,
          lockRetryDelayMs: 1,
          lockStaleMs: 1,
        }).create({ runId: 'run-1', repositoryPath: projectRoot, managedRoot }),
      ).resolves.toMatchObject({ status: 'active' });
    } finally {
      await removeDirectories(projectRoot, managedRoot);
    }
  });
});

describe('GitWorktreeManager conflicts', () => {
  it('rejects conflicting branches, paths, commits, and IDs', async () => {
    const projectRoot = await tempDirectory('bossflow-manager-conflict-');
    const managedRoot = await tempDirectory('bossflow-manager-conflict-root-');
    const canonicalManagedRoot = await realpath(managedRoot);
    const operations = new FakeWorktreeOperations();
    const manager = new GitWorktreeManager({ operations });

    try {
      operations.branches.add('bossflow/run-run-1');
      operations.branchCommit = 'b'.repeat(40);
      await expect(
        manager.create({ runId: 'run-1', repositoryPath: projectRoot, managedRoot }),
      ).rejects.toThrow('does not point at');

      operations.branches.clear();
      await mkdir(path.join(canonicalManagedRoot, 'run-2'), { recursive: true });
      await expect(
        manager.create({ runId: 'run-2', repositoryPath: projectRoot, managedRoot }),
      ).rejects.toThrow('not registered');

      operations.worktrees.push({
        path: path.join(canonicalManagedRoot, 'run-3'),
        head: operations.head,
        branch: undefined,
        isMain: false,
      });
      await expect(
        manager.create({ runId: 'run-3', repositoryPath: projectRoot, managedRoot }),
      ).rejects.toThrow('instead of');

      operations.worktrees[0] = {
        ...operations.worktrees[0]!,
        branch: 'bossflow/run-run-3',
        head: 'c'.repeat(40),
      };
      await expect(
        manager.create({ runId: 'run-3', repositoryPath: projectRoot, managedRoot }),
      ).rejects.toThrow('instead of');

      await expect(
        manager.create({ runId: '../bad', repositoryPath: projectRoot, managedRoot }),
      ).rejects.toThrow('Invalid run ID');
      operations.head = 'not-a-commit';
      await expect(
        manager.create({ runId: 'run-4', repositoryPath: projectRoot, managedRoot }),
      ).rejects.toThrow('invalid commit');
    } finally {
      await removeDirectories(projectRoot, managedRoot);
    }
  });
});

describe('GitWorktreeManager lifecycle', () => {
  it('collects safe patches and reports sensitive paths', async () => {
    const operations = new FakeWorktreeOperations();
    operations.trackedPaths = ['src/index.ts', '.env'];
    operations.untrackedPaths = ['scripts/deploy.key', 'tests/new.test.ts'];
    operations.patch = 'safe patch';
    const manager = new GitWorktreeManager({ operations });

    await expect(
      manager.collectDiff({
        path: '/tmp/worktree',
        branch: 'bossflow/run-1',
        baseCommit: 'a'.repeat(40),
        createdAt: NOW,
        status: 'active',
      }),
    ).resolves.toEqual({
      trackedPaths: ['src/index.ts', '.env'],
      untrackedPaths: ['scripts/deploy.key', 'tests/new.test.ts'],
      changedPaths: ['.env', 'scripts/deploy.key', 'src/index.ts', 'tests/new.test.ts'],
      sensitivePaths: ['.env', 'scripts/deploy.key'],
      patch: 'safe patch',
    });
  });

  it('cleans worktrees, deletes branches, lists managed entries, and finds orphans', async () => {
    const projectRoot = await tempDirectory('bossflow-manager-lifecycle-');
    const managedRoot = await tempDirectory('bossflow-manager-lifecycle-root-');
    const canonicalManagedRoot = await realpath(managedRoot);
    const worktreePath = path.join(canonicalManagedRoot, 'run-1');
    const orphanPath = path.join(canonicalManagedRoot, 'orphan');
    const operations = new FakeWorktreeOperations();
    const metadata = {
      path: worktreePath,
      branch: 'bossflow/run-1',
      baseCommit: 'a'.repeat(40),
      createdAt: NOW,
      status: 'active' as const,
    };
    const manager = new GitWorktreeManager({ operations, managedRoot });

    try {
      await mkdir(worktreePath, { recursive: true });
      await mkdir(orphanPath, { recursive: true });
      operations.worktrees = [
        {
          path: worktreePath,
          head: metadata.baseCommit,
          branch: metadata.branch,
          isMain: false,
        },
      ];
      operations.branches.add(metadata.branch);

      await expect(manager.listManaged({ repositoryPath: projectRoot })).resolves.toEqual(
        operations.worktrees,
      );
      await expect(manager.findOrphans({ repositoryPath: projectRoot })).resolves.toEqual([
        orphanPath,
      ]);

      const cleaned = await manager.cleanup(projectRoot, metadata, {
        force: true,
        deleteBranch: true,
        now: NOW,
      });
      expect(cleaned).toEqual({ ...metadata, status: 'cleaned', cleanedAt: NOW });
      expect(operations.removed).toEqual([{ worktreePath, force: true }]);
      expect(operations.pruned).toBe(1);

      await expect(manager.findOrphans({ repositoryPath: projectRoot })).resolves.toEqual([
        orphanPath,
      ]);
    } finally {
      await removeDirectories(projectRoot, managedRoot);
    }
  });
});

describe('GitWorktreeManager boundary cases', () => {
  it('handles an inactive worktree and a missing managed root', async () => {
    const projectRoot = await tempDirectory('bossflow-manager-inactive-');
    const managedRoot = path.join(projectRoot, 'missing-managed-root');
    const operations = new FakeWorktreeOperations();
    const manager = new GitWorktreeManager({ operations, managedRoot });

    try {
      const cleaned = await manager.cleanup(projectRoot, {
        path: path.join(managedRoot, 'run-1'),
        branch: 'bossflow/run-1',
        baseCommit: 'a'.repeat(40),
        createdAt: NOW,
        status: 'active',
      });
      expect(cleaned.status).toBe('cleaned');
      expect(operations.removed).toEqual([]);
      await expect(manager.findOrphans({ repositoryPath: projectRoot })).resolves.toEqual([]);
      const notDirectory = path.join(projectRoot, 'not-a-directory');
      await writeFile(notDirectory, 'file\n', 'utf8');
      await expect(
        manager.findOrphans({ repositoryPath: projectRoot, managedRoot: notDirectory }),
      ).rejects.toThrow();
      await expect(pathExists('\0')).rejects.toThrow();
      await expect(canonicalizeExistingPath('\0')).rejects.toThrow();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('returns no orphans when the managed root never existed', async () => {
    const projectRoot = await tempDirectory('bossflow-manager-no-root-');
    const managedRoot = path.join(projectRoot, 'missing-managed-root');

    try {
      await expect(
        new GitWorktreeManager({
          operations: new FakeWorktreeOperations(),
          managedRoot,
        }).findOrphans({ repositoryPath: projectRoot }),
      ).resolves.toEqual([]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

async function tempDirectory(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

async function removeDirectories(...directories: readonly string[]): Promise<void> {
  for (const directory of directories) {
    await rm(directory, { recursive: true, force: true });
  }
}
