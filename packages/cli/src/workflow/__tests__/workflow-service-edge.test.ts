/* eslint-disable max-lines, max-lines-per-function -- Stage scenarios share a single workflow fixture. */
import { jest } from '@jest/globals';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '@bossflow/core';
import type {
  ImplementationWorktreeWorkspace,
  ModelRuntime,
  ProjectProfile,
  TechnicalPlan,
  WorkflowRun,
} from '@bossflow/core';

import { CLI_EXIT_CODES, WorkflowService } from '../index.js';

const specification = {
  title: 'Workflow edge cases',
  problem: 'Exercise workflow state handling.',
  scope: ['Handle every stage'],
  nonGoals: [],
  acceptanceCriteria: ['Tests pass'],
  constraints: [],
};

const plan: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Handle workflow stages.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Implement',
      description: 'Implement the workflow.',
      dependencies: [],
      affectedPaths: ['src'],
      acceptanceCriteria: ['Tests pass'],
    },
  ],
  interfaceChanges: [],
  risks: [],
  verificationCommands: [
    {
      id: 'test',
      label: 'Test',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      required: true,
      timeoutMs: 1_000,
    },
  ],
};

describe('WorkflowService stage handling', () => {
  it('resumes spec and plan runs without bypassing gates', async () => {
    const fixture = await createFixture();

    try {
      const specRun = await createRun(fixture, 'spec', { includeSpec: true });
      await expect(
        fixture.service.resume({
          runId: specRun.id,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.USAGE_ERROR });
      const planned = await fixture.service.resume({
        runId: specRun.id,
        modelRuntime: fixture.runtime,
        redactionSecrets: [],
      });
      expect(planned.stage).toBe('plan_approval');

      const planRun = await createRun(fixture, 'plan', {
        includeSpec: true,
        includePlan: true,
      });
      expect(
        (
          await fixture.service.resume({
            runId: planRun.id,
            modelRuntime: fixture.runtime,
            redactionSecrets: [],
          })
        ).stage,
      ).toBe('plan_approval');

      const interruptedBuild = await createRun(fixture, 'plan_approval', {
        includeSpec: true,
        includePlan: true,
      });
      await fixture.service.approve({
        runId: interruptedBuild.id,
        gate: 'plan',
        actions: [],
        actor: 'user',
      });
      const build = await fixture.store.transition(
        interruptedBuild.id,
        'build',
        new Date().toISOString(),
      );
      if (!build.ok) {
        throw new Error(build.reason);
      }
      expect(
        (
          await fixture.service.resume({
            runId: interruptedBuild.id,
            modelRuntime: fixture.runtime,
            redactionSecrets: [],
          })
        ).stage,
      ).toBe('review_approval');

      const generatedPlanRun = await createRun(fixture, 'plan', { includeSpec: true });
      expect(
        (
          await fixture.service.resume({
            runId: generatedPlanRun.id,
            modelRuntime: fixture.runtime,
            redactionSecrets: [],
          })
        ).stage,
      ).toBe('plan_approval');

      const completed = await createRun(fixture, 'completed');
      await expect(
        fixture.service.resume({
          runId: completed.id,
          redactionSecrets: [],
        }),
      ).resolves.toEqual(completed);
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns actionable errors for blocked, failed, missing, and invalid runs', async () => {
    const fixture = await createFixture();

    try {
      const blocked = await createRun(fixture, 'blocked');
      await expectReworkflowError(fixture, blocked.id, CLI_EXIT_CODES.BLOCKED);

      const failed = await createRun(fixture, 'failed', {
        failure: {
          stage: 'review',
          code: 'REVIEW_FAILED',
          message: 'Review service failed.',
          occurredAt: '2026-11-03T00:00:00.000Z',
          retryable: true,
        },
      });
      await expectReworkflowError(fixture, failed.id, CLI_EXIT_CODES.FAILED);
      expect((await fixture.store.read(failed.id)).failure?.message).toBe('Review service failed.');

      const unapprovedBuild = await createRun(fixture, 'build', {
        includeSpec: true,
        includePlan: true,
      });
      await expectReworkflowError(fixture, unapprovedBuild.id, CLI_EXIT_CODES.APPROVAL_REQUIRED);

      await expect(fixture.service.getRun('../invalid')).rejects.toMatchObject({
        exitCode: CLI_EXIT_CODES.RUN_NOT_FOUND,
      });
      const readError = new Error('store unavailable');
      jest.spyOn(fixture.store, 'read').mockRejectedValueOnce(readError);
      await expect(fixture.service.getRun('run-1')).rejects.toBe(readError);
    } finally {
      jest.restoreAllMocks();
      await fixture.cleanup();
    }
  });

  it('reports the next action for every workflow stage', async () => {
    const fixture = await createFixture();

    try {
      const expectations: Readonly<Record<string, string>> = {
        spec: 'bossflow resume',
        plan: 'bossflow resume',
        build: 'bossflow resume',
        verify: 'bossflow resume',
        review: 'bossflow resume',
        plan_approval: 'bossflow approve',
        review_approval: 'bossflow approve',
        completed: 'No action required.',
        blocked: 'Inspect',
        failed: 'Inspect',
      };
      for (const [stage, expectation] of Object.entries(expectations)) {
        const run = await createRun(fixture, stage as WorkflowRun['stage']);
        expect((await fixture.service.status(run.id)).nextAction).toContain(expectation);
      }
    } finally {
      await fixture.cleanup();
    }
  });

  it('uses approved artifacts in plan and review next actions', async () => {
    const fixture = await createFixture();

    try {
      const planRun = await createRun(fixture, 'plan_approval', {
        includeSpec: true,
        includePlan: true,
      });
      await fixture.service.approve({
        runId: planRun.id,
        gate: 'plan',
        actions: [],
        actor: 'user',
      });
      expect((await fixture.service.status(planRun.id)).nextAction).toContain('bossflow resume');

      const reviewRun = await createReviewReadyRun(fixture);
      await fixture.service.approve({
        runId: reviewRun.id,
        gate: 'review',
        actions: [],
        actor: 'user',
      });
      expect((await fixture.service.status(reviewRun.id)).nextAction).toContain('bossflow resume');
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('WorkflowService approval validation', () => {
  it('rejects invalid gates, actions, stages, and missing artifacts', async () => {
    const fixture = await createFixture();

    try {
      const planRun = await createRun(fixture, 'plan_approval', {
        includeSpec: true,
        includePlan: true,
      });
      await fixture.service.approve({
        runId: planRun.id,
        gate: 'plan',
        actions: [],
        actor: 'user',
      });
      const duplicate = await fixture.service.approve({
        runId: planRun.id,
        gate: 'plan',
        actions: [],
        actor: 'user',
      });
      expect(duplicate.approvals).toHaveLength(1);
      await expect(
        fixture.service.approve({
          runId: planRun.id,
          gate: 'plan',
          actions: ['commit'],
          actor: 'user',
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.USAGE_ERROR });

      const noPlan = await createRun(fixture, 'plan_approval');
      await expect(
        fixture.service.approve({
          runId: noPlan.id,
          gate: 'plan',
          actions: [],
          actor: 'user',
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.MISSING_ARTIFACT });

      await expect(
        fixture.service.approve({
          runId: planRun.id,
          gate: 'review',
          actions: [],
          actor: 'user',
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.APPROVAL_REQUIRED });

      const noReview = await createRun(fixture, 'review_approval');
      await expect(
        fixture.service.approve({
          runId: noReview.id,
          gate: 'review',
          actions: [],
          actor: 'user',
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.MISSING_ARTIFACT });
    } finally {
      await fixture.cleanup();
    }
  });
});

async function expectReworkflowError(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  runId: string,
  exitCode: number,
): Promise<void> {
  await expect(
    fixture.service.resume({
      runId,
      modelRuntime: fixture.runtime,
      redactionSecrets: [],
    }),
  ).rejects.toMatchObject({ exitCode });
}

async function createFixture(
  overrides: Partial<ConstructorParameters<typeof WorkflowService>[0]> = {},
) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-workflow-edge-'));
  const worktreeRoot = path.join(projectRoot, 'worktrees');
  await mkdir(worktreeRoot, { recursive: true });
  const store = new FileRunStore({
    runsRoot: path.join(projectRoot, '.bossflow', 'runs'),
  });
  let timestamp = Date.now() + 60_000;
  const service = new WorkflowService({
    store,
    implementer: async () => ({
      schemaVersion: 1,
      status: 'completed',
      summary: 'Implemented.',
      changedPaths: ['src/index.ts'],
      testChanges: [],
      notes: [],
    }),
    worktreeManager: new FakeWorktreeWorkspace(worktreeRoot),
    generateSpecification: async () => specification,
    generateTechnicalPlan: async () => plan,
    generateReview: async () => ({
      schemaVersion: 1,
      summary: 'Ready.',
      findings: [],
      requirementCoverage: [
        {
          requirementId: 'acceptance-1',
          criterion: 'Tests pass',
          status: 'covered',
          evidence: ['test'],
        },
      ],
      unresolvedFindingIds: [],
    }),
    now: () => new Date(++timestamp),
    ...overrides,
  });
  return {
    projectRoot,
    store,
    service,
    runtime: {
      provider: {},
      structuredOutputMode: 'native',
    } as unknown as ModelRuntime,
    cleanup: async () => {
      await rm(projectRoot, { recursive: true, force: true });
    },
  };
}

async function createRun(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  stage: WorkflowRun['stage'],
  options: {
    readonly includeSpec?: boolean;
    readonly includePlan?: boolean;
    readonly failure?: WorkflowRun['failure'];
  } = {},
): Promise<WorkflowRun> {
  const created = await fixture.store.create({
    repositoryPath: fixture.projectRoot,
    goal: 'Workflow edge',
    modelProfile: 'openai',
    projectProfile: createProjectProfile(fixture.projectRoot),
  });
  if (options.includeSpec === true) {
    await fixture.store.writeJson(created, 'spec.json', specification);
  }
  if (options.includePlan === true) {
    await fixture.store.writeJson(created, 'plan.json', plan);
  }
  const current = await fixture.store.read(created.id);
  return fixture.store.save({
    ...current,
    stage,
    ...(options.failure === undefined ? {} : { failure: options.failure }),
    updatedAt: new Date().toISOString(),
  });
}

async function createReviewReadyRun(
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<WorkflowRun> {
  const created = await fixture.store.create({
    repositoryPath: fixture.projectRoot,
    goal: 'Review edge',
    modelProfile: 'openai',
    projectProfile: createProjectProfile(fixture.projectRoot),
  });
  await fixture.store.writeJson(created, 'review.json', {
    schemaVersion: 1,
    summary: 'Ready.',
    findings: [],
    requirementCoverage: [
      {
        requirementId: 'acceptance-1',
        criterion: 'Tests pass',
        status: 'covered',
        evidence: ['test'],
      },
    ],
    unresolvedFindingIds: [],
  });
  const current = await fixture.store.read(created.id);
  return fixture.store.save({
    ...current,
    stage: 'review_approval',
    updatedAt: new Date().toISOString(),
  });
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
    packageScripts: {},
    verificationCommands: [
      {
        id: 'test',
        label: 'Test',
        command: 'node',
        args: ['-e', 'process.exit(0)'],
        required: true,
        timeoutMs: 1_000,
      },
    ],
    ambiguities: [],
    requiresConfirmation: false,
    confirmedByUser: true,
  };
}

class FakeWorktreeWorkspace implements ImplementationWorktreeWorkspace {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  async create(options: Parameters<ImplementationWorktreeWorkspace['create']>[0]) {
    const worktreePath = path.join(this.#root, options.runId);
    await mkdir(worktreePath, { recursive: true });
    return {
      path: worktreePath,
      branch: `bossflow/run-${options.runId}`,
      baseCommit: 'a'.repeat(40),
      createdAt: '2026-11-03T00:00:00.000Z',
      status: 'active' as const,
    };
  }

  async readStatus() {
    return { isDirty: false, fingerprint: 'a'.repeat(64) };
  }

  async collectDiff() {
    return {
      trackedPaths: ['src/index.ts'],
      untrackedPaths: [],
      changedPaths: ['src/index.ts'],
      sensitivePaths: [],
      patch: 'diff --git a/src/index.ts b/src/index.ts\n+implemented\n',
    };
  }
}
