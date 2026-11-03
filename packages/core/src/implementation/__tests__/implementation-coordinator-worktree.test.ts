import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { simpleGit } from 'simple-git';

import { GitWorktreeManager } from '../../worktree/index.js';
import { ImplementationCoordinator } from '../index.js';
import { FakeWorkspace, NOW, RESULT, createApprovedRun } from './support/implementation-fixture.js';

describe('ImplementationCoordinator worktrees', () => {
  it('reuses a worktree after an interrupted implementation', async () => {
    const fixture = await createApprovedRun();
    const workspace = new FakeWorkspace();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: workspace,
      now: () => new Date(NOW),
    });

    try {
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => {
            throw new Error('interrupted');
          },
        }),
      ).rejects.toThrow('interrupted');

      const outcome = await coordinator.execute({
        runId: fixture.run.id,
        implementer: async () => RESULT,
      });
      expect(outcome.status).toBe('implemented');
      expect(workspace.createCalls).toBe(2);
      expect(workspace.addedWorktrees).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns already-completed with cleaned or missing worktree metadata', async () => {
    const fixture = await createApprovedRun();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: new FakeWorkspace(),
      now: () => new Date(NOW),
    });

    try {
      const completed = await coordinator.execute({
        runId: fixture.run.id,
        implementer: async () => RESULT,
      });
      if (completed.status !== 'implemented') {
        throw new Error('Expected implementation to complete.');
      }
      await fixture.store.save({
        ...completed.run,
        worktree: { ...completed.worktree, status: 'cleaned', cleanedAt: NOW },
        updatedAt: '2026-11-03T00:00:01.000Z',
      });
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).resolves.toMatchObject({
        status: 'already-completed',
        worktree: { status: 'cleaned' },
      });

      await fixture.store.save({
        ...completed.run,
        worktree: undefined,
        updatedAt: '2026-11-03T00:00:02.000Z',
      });
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).resolves.toMatchObject({ status: 'already-completed' });
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ImplementationCoordinator Git integration', () => {
  it('keeps source changes inside the real isolated worktree', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-implementation-git-'));
    const managedRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-implementation-worktrees-'));
    const git = simpleGit(projectRoot);
    await git.init(['--initial-branch=main']);
    await git.raw(['config', 'user.name', 'BossFlow Test']);
    await git.raw(['config', 'user.email', 'bossflow@example.com']);
    await mkdir(path.join(projectRoot, 'src'), { recursive: true });
    await writeFile(path.join(projectRoot, 'src', 'index.ts'), 'export const value = 0;\n');
    await git.add(['--all']);
    await git.commit('Initial commit');
    const fixture = await createApprovedRun(projectRoot);
    const worktreeManager = new GitWorktreeManager({ managedRoot });
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager,
      now: () => new Date(NOW),
    });

    try {
      const outcome = await coordinator.execute({
        runId: fixture.run.id,
        implementer: async (context) => {
          await writeFile(
            path.join(context.worktreePath, 'src', 'index.ts'),
            'export const value = 1;\n',
            'utf8',
          );
          return RESULT;
        },
      });
      if (outcome.status !== 'implemented') {
        throw new Error(`Expected implementation success, received ${outcome.status}.`);
      }

      await expect(readFile(path.join(projectRoot, 'src', 'index.ts'), 'utf8')).resolves.toBe(
        'export const value = 0;\n',
      );
      await expect(
        readFile(path.join(outcome.worktree.path, 'src', 'index.ts'), 'utf8'),
      ).resolves.toBe('export const value = 1;\n');
      await expect(worktreeManager.readStatus(projectRoot)).resolves.toMatchObject({
        isDirty: false,
      });
      await worktreeManager.cleanup(projectRoot, outcome.worktree, {
        force: true,
        deleteBranch: true,
      });
    } finally {
      await fixture.cleanup();
      await rm(projectRoot, { recursive: true, force: true });
      await rm(managedRoot, { recursive: true, force: true });
    }
  });
});
