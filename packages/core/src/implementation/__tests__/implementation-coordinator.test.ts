import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ImplementationCoordinator } from '../index.js';
import {
  FakeWorkspace,
  NOW,
  PLAN,
  RESULT,
  SAFE_DIFF,
  createApprovedRun,
} from './support/implementation-fixture.js';

describe('ImplementationCoordinator artifacts', () => {
  it('runs the implementer, validates paths, and persists evidence', async () => {
    const fixture = await createApprovedRun();
    const workspace = new FakeWorkspace();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: workspace,
      now: () => new Date(NOW),
    });
    const implementer = jest.fn(async () => RESULT);
    const controller = new AbortController();

    try {
      const outcome = await coordinator.execute({
        runId: fixture.run.id,
        implementer,
        signal: controller.signal,
      });

      expect(outcome).toMatchObject({
        status: 'implemented',
        run: { stage: 'verify' },
        result: RESULT,
        diff: SAFE_DIFF,
      });
      expect(implementer).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: fixture.run.id,
          baseCommit: 'a'.repeat(40),
          approvedPaths: ['src'],
          plan: expect.objectContaining({ summary: PLAN.summary }),
          signal: controller.signal,
        }),
      );

      const runDirectory = path.join(fixture.runsRoot, fixture.run.id);
      const record = JSON.parse(
        await readFile(path.join(runDirectory, 'implementation.json'), 'utf8'),
      );
      expect(record).toMatchObject({
        changedPaths: ['src/index.ts'],
        unexpectedPaths: [],
      });
      await expect(
        readFile(path.join(runDirectory, 'implementation.patch'), 'utf8'),
      ).resolves.toContain('+export const value = 1;');
      await expect(
        readFile(path.join(runDirectory, 'implementation.md'), 'utf8'),
      ).resolves.toContain('- Status: completed');
    } finally {
      await fixture.cleanup();
    }
  });

  it('does not invoke the implementer again after completion', async () => {
    const fixture = await createApprovedRun();
    const workspace = new FakeWorkspace();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: workspace,
      now: () => new Date(NOW),
    });
    const implementer = jest.fn(async () => RESULT);

    try {
      await coordinator.execute({
        runId: fixture.run.id,
        implementer,
      });
      const resumed = await coordinator.execute({
        runId: fixture.run.id,
        implementer,
      });
      expect(resumed.status).toBe('already-completed');
      expect(implementer).toHaveBeenCalledTimes(1);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ImplementationCoordinator artifact safety', () => {
  it('redacts secrets from implementation result and patch', async () => {
    const fixture = await createApprovedRun();
    const secret = 'sk-super-secret-token';
    const workspace = new FakeWorkspace({
      ...SAFE_DIFF,
      patch: `+const token = "${secret}";\n`,
    });
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: workspace,
    });

    try {
      const outcome = await coordinator.execute({
        runId: fixture.run.id,
        implementer: async () => ({
          ...RESULT,
          notes: [`token=${secret}`],
          failure: {
            kind: 'unknown',
            diagnostic: `failure token=${secret}`,
          },
          status: 'blocked',
        }),
      });

      const runDirectory = path.join(fixture.runsRoot, fixture.run.id);
      const record = await readFile(path.join(runDirectory, 'implementation.json'), 'utf8');
      const markdown = await readFile(path.join(runDirectory, 'implementation.md'), 'utf8');
      const patch = await readFile(path.join(runDirectory, 'implementation.patch'), 'utf8');
      expect(record).not.toContain(secret);
      expect(markdown).not.toContain(secret);
      expect(patch).not.toContain(secret);
      expect(record).toContain('[REDACTED]');
      expect(markdown).toContain('[REDACTED]');
      expect(patch).toContain('[REDACTED]');
      if (outcome.status === 'blocked') {
        expect(outcome.diff.patch).not.toContain(secret);
        expect(outcome.diff.patch).toContain('[REDACTED]');
      }
    } finally {
      await fixture.cleanup();
    }
  });

  it('persists no patch file when there are no changes', async () => {
    const fixture = await createApprovedRun();
    const workspace = new FakeWorkspace({
      trackedPaths: [],
      untrackedPaths: [],
      changedPaths: [],
      sensitivePaths: [],
      patch: '',
    });
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: workspace,
    });

    try {
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).resolves.toMatchObject({ status: 'implemented' });
      await expect(
        readFile(path.join(fixture.runsRoot, fixture.run.id, 'implementation.patch'), 'utf8'),
      ).rejects.toThrow();
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
