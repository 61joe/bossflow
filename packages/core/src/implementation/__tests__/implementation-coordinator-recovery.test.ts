import { jest } from '@jest/globals';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '../../run-store/index.js';
import type { RunStore } from '../../run-store/index.js';
import type { WorkflowRun } from '../../workflow/index.js';
import { ImplementationCoordinator } from '../index.js';
import {
  FakeWorkspace,
  NOW,
  RESULT,
  SAFE_DIFF,
  createApprovedRun,
} from './support/implementation-fixture.js';

describe('ImplementationCoordinator recovery integrity', () => {
  it('rejects a missing plan artifact and a missing approval', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-recovery-plan-'));
    const store = new FileRunStore({ runsRoot });

    try {
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Missing plan',
        modelProfile: 'openai',
      });
      const coordinator = new ImplementationCoordinator({
        store,
        worktreeManager: new FakeWorkspace(),
      });
      await expect(
        coordinator.execute({
          runId: run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('no persisted plan artifact');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('handles legacy runs without artifact or approval arrays', async () => {
    const run: WorkflowRun = {
      schemaVersion: 1,
      id: 'legacy-run',
      repositoryPath: '/tmp/project',
      goal: 'Legacy run',
      modelProfile: 'openai',
      stage: 'plan_approval',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const withoutArtifacts = {
      read: async () => run,
    } as unknown as RunStore;
    await expect(
      new ImplementationCoordinator({
        store: withoutArtifacts,
        worktreeManager: new FakeWorkspace(),
      }).execute({
        runId: run.id,
        implementer: async () => RESULT,
      }),
    ).rejects.toThrow('no persisted plan artifact');

    const withoutApprovals = {
      read: async () => ({
        ...run,
        artifacts: [
          {
            kind: 'plan' as const,
            fileName: 'plan.json',
            path: '/tmp/project/plan.json',
            createdAt: NOW,
            sha256: 'a'.repeat(64),
          },
        ],
      }),
    } as unknown as RunStore;
    await expect(
      new ImplementationCoordinator({
        store: withoutApprovals,
        worktreeManager: new FakeWorkspace(),
      }).execute({
        runId: run.id,
        implementer: async () => RESULT,
      }),
    ).rejects.toThrow('no matching approval');
  });
});

describe('ImplementationCoordinator recovery validation', () => {
  it('rejects modified implementation and patch artifacts', async () => {
    const fixture = await createApprovedRun();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: new FakeWorkspace(),
    });

    try {
      await coordinator.execute({
        runId: fixture.run.id,
        implementer: async () => RESULT,
      });
      const runDirectory = path.join(fixture.runsRoot, fixture.run.id);
      const implementationPath = path.join(runDirectory, 'implementation.json');
      const original = await readFile(implementationPath, 'utf8');
      await writeFile(implementationPath, `${original} `, 'utf8');
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('has been modified');

      await writeFile(implementationPath, original, 'utf8');
      await writeFile(
        path.join(runDirectory, 'implementation.patch'),
        `${SAFE_DIFF.patch}modified`,
        'utf8',
      );
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('patch');
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects an implementation record from another run', async () => {
    const fixture = await createApprovedRun();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: new FakeWorkspace(),
    });

    try {
      const completed = await coordinator.execute({
        runId: fixture.run.id,
        implementer: async () => RESULT,
      });
      if (completed.status !== 'implemented') {
        throw new Error('Expected implementation to complete.');
      }
      const record = JSON.parse(
        await readFile(path.join(fixture.runsRoot, fixture.run.id, 'implementation.json'), 'utf8'),
      );
      await fixture.store.writeJson(completed.run, 'implementation.json', {
        ...record,
        runId: 'another-run',
      });
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('different run');
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ImplementationCoordinator recovery transitions', () => {
  it('rejects an artifact that cannot recover the current stage', async () => {
    const fixture = await createApprovedRun();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: new FakeWorkspace(),
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
        stage: 'blocked',
        updatedAt: '2999-01-01T00:00:00.000Z',
      });
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('cannot recover stage');
    } finally {
      await fixture.cleanup();
    }
  });

  it('propagates recovery and build-gate transition failures', async () => {
    const fixture = await createApprovedRun();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: new FakeWorkspace(),
    });

    try {
      const buildSpy = jest.spyOn(fixture.store, 'transition').mockResolvedValueOnce({
        ok: false,
        from: 'plan_approval',
        to: 'build',
        reason: 'build gate failed',
      });
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('build gate failed');
      buildSpy.mockRestore();

      const completed = await coordinator.execute({
        runId: fixture.run.id,
        implementer: async () => RESULT,
      });
      if (completed.status !== 'implemented') {
        throw new Error('Expected implementation to complete.');
      }
      await fixture.store.save({
        ...completed.run,
        stage: 'build',
        updatedAt: '2999-01-01T00:00:00.000Z',
      });
      jest.spyOn(fixture.store, 'transition').mockResolvedValueOnce({
        ok: false,
        from: 'build',
        to: 'verify',
        reason: 'recovery failed',
      });
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('recovery failed');
    } finally {
      jest.restoreAllMocks();
      await fixture.cleanup();
    }
  });
});
