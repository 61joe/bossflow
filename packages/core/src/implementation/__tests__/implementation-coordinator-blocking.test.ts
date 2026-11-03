import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '../../run-store/index.js';
import { ImplementationCoordinator } from '../index.js';
import {
  FakeWorkspace,
  NOW,
  PLAN,
  RESULT,
  SAFE_DIFF,
  createApprovedRun,
} from './support/implementation-fixture.js';

describe('ImplementationCoordinator blocking', () => {
  it.each([
    {
      name: 'blocked result',
      result: { ...RESULT, status: 'blocked' as const },
      diff: SAFE_DIFF,
      reason: 'blocked result',
    },
    {
      name: 'sensitive path',
      result: RESULT,
      diff: {
        ...SAFE_DIFF,
        changedPaths: ['src/index.ts', '.env'],
        sensitivePaths: ['.env'],
      },
      reason: 'Sensitive files',
    },
    {
      name: 'out-of-scope path',
      result: RESULT,
      diff: {
        ...SAFE_DIFF,
        changedPaths: ['src/index.ts', 'packages/cli/index.ts'],
      },
      reason: 'outside the approved scope',
    },
  ])('blocks implementation for $name', async ({ result, diff, reason }) => {
    const fixture = await createApprovedRun();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: new FakeWorkspace(diff),
    });

    try {
      const outcome = await coordinator.execute({
        runId: fixture.run.id,
        implementer: async () => result,
      });
      expect(outcome).toMatchObject({ status: 'blocked', run: { stage: 'blocked' } });
      if (outcome.status === 'blocked') {
        expect(outcome.reasons.join(' ')).toContain(reason);
      }
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ImplementationCoordinator validation', () => {
  it.each(['', '/absolute', 'src/../escape'])(
    'rejects invalid changed path %s',
    async (changedPath) => {
      const fixture = await createApprovedRun();
      const coordinator = new ImplementationCoordinator({
        store: fixture.store,
        worktreeManager: new FakeWorkspace({
          ...SAFE_DIFF,
          changedPaths: [changedPath],
        }),
      });

      try {
        await expect(
          coordinator.execute({
            runId: fixture.run.id,
            implementer: async () => RESULT,
          }),
        ).rejects.toThrow('Invalid repository path');
      } finally {
        await fixture.cleanup();
      }
    },
  );

  it('rejects main worktree changes during implementation', async () => {
    const fixture = await createApprovedRun();
    const workspace = new FakeWorkspace();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: workspace,
    });

    try {
      workspace.statuses = [
        { isDirty: false, fingerprint: 'before' },
        { isDirty: false, fingerprint: 'after' },
      ];
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('main working tree changed');
    } finally {
      await fixture.cleanup();
    }
  });

  it.each(['verify', 'blocked'] as const)(
    'propagates a failed %s transition after persisting artifacts',
    async (target) => {
      const fixture = await createApprovedRun();
      const originalTransition = fixture.store.transition.bind(fixture.store);
      let calls = 0;
      jest
        .spyOn(fixture.store, 'transition')
        .mockImplementation(async (runId, to, updatedAt, transitionOptions) => {
          calls += 1;
          if (calls === 2) {
            return { ok: false, from: 'build', to, reason: `${target} rejected` };
          }
          return originalTransition(runId, to, updatedAt, transitionOptions);
        });
      const diff =
        target === 'blocked'
          ? {
              ...SAFE_DIFF,
              changedPaths: ['src/index.ts', '.env'],
              sensitivePaths: ['.env'],
            }
          : SAFE_DIFF;
      const coordinator = new ImplementationCoordinator({
        store: fixture.store,
        worktreeManager: new FakeWorkspace(diff),
      });
      const implementer = jest.fn(async () => RESULT);

      try {
        await expect(
          coordinator.execute({
            runId: fixture.run.id,
            implementer,
          }),
        ).rejects.toThrow(`${target} rejected`);

        const resumed = await coordinator.execute({
          runId: fixture.run.id,
          implementer,
        });
        expect(resumed.status).toBe('already-completed');
        expect(resumed.run.stage).toBe(target);
        expect(implementer).toHaveBeenCalledTimes(1);
      } finally {
        jest.restoreAllMocks();
        await fixture.cleanup();
      }
    },
  );
});

describe('ImplementationCoordinator gates', () => {
  it('rejects a run without plan approval', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-implementation-gate-'));
    const store = new FileRunStore({ runsRoot });

    try {
      const run = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'No approval',
        modelProfile: 'openai',
      });
      const plan = await store.transition(run.id, 'plan', NOW);
      if (!plan.ok) {
        throw new Error(plan.reason);
      }
      await store.writeJson(plan.run, 'plan.json', PLAN);
      await store.transition(run.id, 'plan_approval', NOW);
      const coordinator = new ImplementationCoordinator({
        store,
        worktreeManager: new FakeWorkspace(),
      });
      await expect(
        coordinator.execute({
          runId: run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('no matching approval');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('rejects a plan artifact modified after approval', async () => {
    const fixture = await createApprovedRun();
    const coordinator = new ImplementationCoordinator({
      store: fixture.store,
      worktreeManager: new FakeWorkspace(),
    });

    try {
      await writeFile(
        path.join(fixture.runsRoot, fixture.run.id, 'plan.json'),
        JSON.stringify({ ...PLAN, affectedPaths: ['packages/cli'] }),
        'utf8',
      );
      await expect(
        coordinator.execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('has been modified');
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects implementation from an unrelated stage', async () => {
    const fixture = await createApprovedRun();

    try {
      await fixture.store.save({
        ...fixture.run,
        stage: 'blocked',
        updatedAt: '2026-11-03T00:00:01.000Z',
      });
      await expect(
        new ImplementationCoordinator({
          store: fixture.store,
          worktreeManager: new FakeWorkspace(),
        }).execute({
          runId: fixture.run.id,
          implementer: async () => RESULT,
        }),
      ).rejects.toThrow('requires the plan_approval stage');
    } finally {
      await fixture.cleanup();
    }
  });
});
