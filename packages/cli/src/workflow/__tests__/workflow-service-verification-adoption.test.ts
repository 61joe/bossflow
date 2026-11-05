/* eslint-disable max-lines-per-function -- Verification adoption scenarios share one Plan fixture. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '@bossflow/core';
import type { ProjectProfile, TechnicalPlan, WorkflowRun } from '@bossflow/core';

import { CLI_EXIT_CODES, WorkflowService } from '../index.js';

const NOW = '2026-11-03T00:00:00.000Z';
const TEST_COMMAND = {
  id: 'test',
  label: 'Test',
  command: 'pnpm',
  args: ['test'],
  required: true,
  timeoutMs: 1_000,
} as const;
const BROWSER_COMMAND = {
  id: 'browser',
  label: 'Browser test',
  command: 'pnpm',
  args: ['test:browser'],
  required: true,
  timeoutMs: 2_000,
} as const;
const PLAN: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Adopt a browser check.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Implement',
      description: 'Implement the change.',
      dependencies: [],
      affectedPaths: ['src'],
      acceptanceCriteria: ['Works.'],
    },
  ],
  interfaceChanges: [],
  risks: [],
  verificationCommands: [TEST_COMMAND, BROWSER_COMMAND],
};

describe('WorkflowService Plan verification adoption', () => {
  it('keeps Plan commands advisory when none are selected', async () => {
    const fixture = await createPlanRun();

    try {
      const approved = await fixture.service.approve({
        runId: fixture.run.id,
        gate: 'plan',
        actions: [],
        actor: 'user',
      });
      expect(approved.approvals?.[0]?.verificationCommandIds).toBeUndefined();
      expect(approved.projectProfile?.verificationCommands).toEqual([TEST_COMMAND]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('records and applies selected Plan verification commands', async () => {
    const fixture = await createPlanRun();

    try {
      const approved = await fixture.service.approve({
        runId: fixture.run.id,
        gate: 'plan',
        actions: [],
        verificationCommandIds: ['browser'],
        actor: 'user',
        note: 'browser acceptance approved',
      });
      expect(approved.projectProfile?.verificationCommands).toEqual([
        TEST_COMMAND,
        BROWSER_COMMAND,
      ]);
      expect(approved.approvals).toEqual([
        expect.objectContaining({
          verificationCommandIds: ['browser'],
          verificationCommands: [BROWSER_COMMAND],
          notes: 'browser acceptance approved',
        }),
      ]);

      await expect(
        fixture.service.approve({
          runId: fixture.run.id,
          gate: 'plan',
          actions: [],
          verificationCommandIds: ['browser'],
          actor: 'user',
        }),
      ).resolves.toMatchObject({ id: fixture.run.id });
      await expect(
        fixture.service.approve({
          runId: fixture.run.id,
          gate: 'plan',
          actions: [],
          verificationCommandIds: ['test'],
          actor: 'user',
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.USAGE_ERROR });
    } finally {
      await fixture.cleanup();
    }
  });

  it.each([
    {
      name: 'duplicate selection',
      commandIds: ['browser', 'browser'],
      plan: PLAN,
      message: 'must be unique',
    },
    {
      name: 'unknown command',
      commandIds: ['missing'],
      plan: PLAN,
      message: 'does not contain',
    },
    {
      name: 'conflicting project command',
      commandIds: ['test'],
      plan: {
        ...PLAN,
        verificationCommands: [{ ...TEST_COMMAND, args: ['test:different'] }, BROWSER_COMMAND],
      },
      message: 'conflicts',
    },
    {
      name: 'duplicate Plan ID',
      commandIds: ['browser'],
      plan: {
        ...PLAN,
        verificationCommands: [BROWSER_COMMAND, BROWSER_COMMAND],
      },
      message: 'duplicate verification command ID',
    },
  ])('rejects $name without recording approval', async ({ commandIds, plan, message }) => {
    const fixture = await createPlanRun(plan);

    try {
      await expect(
        fixture.service.approve({
          runId: fixture.run.id,
          gate: 'plan',
          actions: [],
          verificationCommandIds: commandIds,
          actor: 'user',
        }),
      ).rejects.toThrow(message);
      expect((await fixture.store.read(fixture.run.id)).approvals).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects adoption without a project profile', async () => {
    const fixture = await createPlanRun(PLAN, null);

    try {
      await expect(
        fixture.service.approve({
          runId: fixture.run.id,
          gate: 'plan',
          actions: [],
          verificationCommandIds: ['browser'],
          actor: 'user',
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.MISSING_ARTIFACT });
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects verification options at Review approval', async () => {
    const fixture = await createPlanRun();

    try {
      await fixture.store.save({
        ...fixture.run,
        stage: 'review_approval',
        updatedAt: new Date(Date.parse(fixture.run.updatedAt) + 1_000).toISOString(),
      });
      await expect(
        fixture.service.approve({
          runId: fixture.run.id,
          gate: 'review',
          actions: [],
          verificationCommandIds: ['browser'],
          actor: 'user',
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.USAGE_ERROR });
    } finally {
      await fixture.cleanup();
    }
  });
});

async function createPlanRun(
  plan: TechnicalPlan = PLAN,
  projectProfile: ProjectProfile | null = createProjectProfile('/tmp/project'),
) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-adoption-'));
  const runsRoot = path.join(projectRoot, '.bossflow', 'runs');
  const store = new FileRunStore({ runsRoot });
  let run = await store.create({
    repositoryPath: projectRoot,
    goal: 'Adopt verification',
    modelProfile: 'openai',
    ...(projectProfile === null ? {} : { projectProfile }),
  });
  run = requireTransition(await store.transition(run.id, 'plan', NOW));
  await store.writeJson(run, 'plan.json', plan);
  run = await store.read(run.id);
  run = requireTransition(await store.transition(run.id, 'plan_approval', NOW));
  const service = new WorkflowService({
    store,
    implementer: async () => {
      throw new Error('not used');
    },
    now: () => new Date(NOW),
    createId: () => 'approval-1',
  });
  return {
    store,
    run,
    service,
    cleanup: () => rm(projectRoot, { recursive: true, force: true }),
  };
}

function createProjectProfile(repositoryRoot: string): ProjectProfile {
  return {
    schemaVersion: 1,
    repositoryRoot,
    git: {
      isRepository: true,
      branch: 'main',
      status: 'clean',
      changedPaths: [],
    },
    packageManager: 'pnpm',
    languages: ['TypeScript'],
    frameworks: [],
    conventionFiles: [],
    planningContextFiles: [],
    testConfigFiles: [],
    packageScripts: { test: 'pnpm test' },
    verificationCommands: [TEST_COMMAND],
    ambiguities: [],
    requiresConfirmation: false,
    confirmedByUser: true,
  };
}

function requireTransition(result: Awaited<ReturnType<FileRunStore['transition']>>): WorkflowRun {
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.run;
}
