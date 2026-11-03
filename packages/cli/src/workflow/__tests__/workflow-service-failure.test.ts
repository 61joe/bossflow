/* eslint-disable max-lines, max-lines-per-function -- Failure scenarios share a single workflow fixture. */
import { jest } from '@jest/globals';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore, VerificationReportSchema } from '@bossflow/core';
import type {
  ImplementationWorktreeWorkspace,
  ModelRuntime,
  ProjectProfile,
  TechnicalPlan,
  WorkflowRun,
} from '@bossflow/core';

import { CLI_EXIT_CODES, WorkflowService } from '../index.js';

const specification = {
  title: 'Workflow failures',
  problem: 'Exercise failure branches.',
  scope: ['Fail safely'],
  nonGoals: [],
  acceptanceCriteria: ['Failures are visible'],
  constraints: [],
};

const plan: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Implement failure handling.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Implement',
      description: 'Implement.',
      dependencies: [],
      affectedPaths: ['src'],
      acceptanceCriteria: ['Failures are visible'],
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

describe('WorkflowService pipeline failures', () => {
  it('returns blocked when implementation, verification, or review fails', async () => {
    const blockedImplementation = await createFixture({
      implementer: async () => ({
        schemaVersion: 1,
        status: 'blocked',
        summary: 'Cannot implement.',
        changedPaths: [],
        testChanges: [],
        notes: ['Blocked.'],
      }),
    });
    try {
      const run = await createApprovedPlanRun(blockedImplementation);
      await expectResume(blockedImplementation, run.id, CLI_EXIT_CODES.BLOCKED);
    } finally {
      await blockedImplementation.cleanup();
    }

    const failedVerification = await createFixture();
    try {
      const run = await createVerificationRun(failedVerification);
      await expectResume(failedVerification, run.id, CLI_EXIT_CODES.BLOCKED);
    } finally {
      await failedVerification.cleanup();
    }

    const blockedReview = await createFixture({
      generateReview: async () => ({
        schemaVersion: 1,
        summary: 'Blocking finding.',
        findings: [
          {
            id: 'p1',
            severity: 'P1',
            title: 'Blocked',
            description: 'Blocked.',
            status: 'open',
          },
        ],
        requirementCoverage: [
          {
            requirementId: 'acceptance-1',
            criterion: 'Failures are visible',
            status: 'covered',
            evidence: ['review'],
          },
        ],
        unresolvedFindingIds: ['p1'],
      }),
    });
    try {
      const run = await createReviewStageRun(blockedReview);
      await expectResume(blockedReview, run.id, CLI_EXIT_CODES.BLOCKED);
    } finally {
      await blockedReview.cleanup();
    }
  });

  it('surfaces missing project context and specification artifacts', async () => {
    const fixture = await createFixture();

    try {
      const noProfile = await fixture.store.create({
        repositoryPath: fixture.projectRoot,
        goal: 'Missing profile',
        modelProfile: 'openai',
      });
      await fixture.store.writeJson(noProfile, 'spec.json', specification);
      await expectResume(fixture, noProfile.id, CLI_EXIT_CODES.MISSING_ARTIFACT);

      const noSpec = await createRun(fixture, 'plan', {
        includeSpec: false,
        includePlan: true,
      });
      await expectResume(fixture, noSpec.id, CLI_EXIT_CODES.MISSING_ARTIFACT);

      const failedWithoutMetadata = await createRun(fixture, 'failed');
      await expectResume(fixture, failedWithoutMetadata.id, CLI_EXIT_CODES.FAILED);
    } finally {
      await fixture.cleanup();
    }
  });

  it('fails safely when stage transitions are rejected', async () => {
    const planTransition = await createFixture();
    try {
      jest.spyOn(planTransition.store, 'transition').mockResolvedValueOnce({
        ok: false,
        from: 'spec',
        to: 'plan',
        reason: 'plan transition failed',
      });
      await expect(planTransition.service.run(runOptions(planTransition))).rejects.toMatchObject({
        exitCode: CLI_EXIT_CODES.GENERAL_ERROR,
      });
    } finally {
      jest.restoreAllMocks();
      await planTransition.cleanup();
    }

    const approvalTransition = await createFixture();
    try {
      const originalTransition = approvalTransition.store.transition.bind(approvalTransition.store);
      jest
        .spyOn(approvalTransition.store, 'transition')
        .mockImplementationOnce(originalTransition)
        .mockResolvedValueOnce({
          ok: false,
          from: 'plan',
          to: 'plan_approval',
          reason: 'approval transition failed',
        });
      await expect(
        approvalTransition.service.run(runOptions(approvalTransition)),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.GENERAL_ERROR });
    } finally {
      jest.restoreAllMocks();
      await approvalTransition.cleanup();
    }

    const completionTransition = await createFixture();
    try {
      const run = await createReviewReadyRun(completionTransition);
      await completionTransition.service.approve({
        runId: run.id,
        gate: 'review',
        actions: [],
        actor: 'user',
      });
      jest.spyOn(completionTransition.store, 'transition').mockResolvedValueOnce({
        ok: false,
        from: 'review_approval',
        to: 'completed',
        reason: 'completion transition failed',
      });
      await expectResume(completionTransition, run.id, CLI_EXIT_CODES.GENERAL_ERROR);
    } finally {
      jest.restoreAllMocks();
      await completionTransition.cleanup();
    }
  });
});

async function expectResume(
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
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-workflow-failure-'));
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
          criterion: 'Failures are visible',
          status: 'covered',
          evidence: ['review'],
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

function runOptions(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return {
    goal: 'Workflow failure',
    projectContext: {
      profile: createProjectProfile(fixture.projectRoot),
      documents: [],
    },
    modelRuntime: fixture.runtime,
    modelProfile: 'openai',
    confirmedProject: true,
    stopAfterSpec: false,
  };
}

async function createApprovedPlanRun(
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<WorkflowRun> {
  const created = await fixture.service.run(runOptions(fixture));
  await fixture.service.approve({
    runId: created.run.id,
    gate: 'plan',
    actions: [],
    actor: 'user',
  });
  return created.run;
}

async function createVerificationRun(
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<WorkflowRun> {
  const worktreePath = path.join(fixture.projectRoot, 'verification-worktree');
  await mkdir(worktreePath, { recursive: true });
  const created = await fixture.store.create({
    repositoryPath: fixture.projectRoot,
    goal: 'Failed verification',
    modelProfile: 'openai',
    projectProfile: {
      ...createProjectProfile(fixture.projectRoot),
      verificationCommands: [
        {
          id: 'test',
          label: 'Test',
          command: 'node',
          args: ['-e', 'process.exit(1)'],
          required: true,
          timeoutMs: 1_000,
        },
      ],
    },
  });
  return fixture.store.save({
    ...created,
    stage: 'verify',
    worktree: {
      path: worktreePath,
      branch: 'bossflow/run-failed-verification',
      baseCommit: 'a'.repeat(40),
      createdAt: '2026-11-03T00:00:00.000Z',
      status: 'active',
    },
    updatedAt: new Date().toISOString(),
  });
}

async function createReviewStageRun(
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<WorkflowRun> {
  const created = await fixture.store.create({
    repositoryPath: fixture.projectRoot,
    goal: 'Blocked review',
    modelProfile: 'openai',
    projectProfile: createProjectProfile(fixture.projectRoot),
  });
  await fixture.store.writeJson(created, 'spec.json', specification);
  await fixture.store.writeJson(created, 'plan.json', plan);
  await fixture.store.writeMarkdown(
    created,
    'implementation.patch',
    'diff --git a/src/index.ts b/src/index.ts\n+implemented\n',
  );
  await fixture.store.writeJson(
    created,
    'verification.json',
    VerificationReportSchema.parse({
      schemaVersion: 1,
      runId: created.id,
      status: 'passed',
      records: [],
      startedAt: '2026-11-03T00:00:00.000Z',
      endedAt: '2026-11-03T00:00:00.000Z',
    }),
  );
  const current = await fixture.store.read(created.id);
  const planArtifact = current.artifacts?.find((artifact) => artifact.fileName === 'plan.json');
  return fixture.store.save({
    ...current,
    stage: 'review',
    approvals: [
      {
        id: 'plan-approval',
        gate: 'plan',
        decision: 'approved',
        actor: 'user',
        decidedAt: '2026-11-03T00:00:00.000Z',
        workflowRevision: current.workflowRevision ?? 1,
        artifactFileName: 'plan.json',
        artifactSha256: planArtifact?.sha256,
      },
    ],
    updatedAt: new Date().toISOString(),
  });
}

async function createReviewReadyRun(
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<WorkflowRun> {
  const created = await fixture.store.create({
    repositoryPath: fixture.projectRoot,
    goal: 'Review ready',
    modelProfile: 'openai',
  });
  await fixture.store.writeJson(created, 'review.json', {
    schemaVersion: 1,
    summary: 'Ready.',
    findings: [],
    requirementCoverage: [
      {
        requirementId: 'acceptance-1',
        criterion: 'Failures are visible',
        status: 'covered',
        evidence: ['review'],
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

async function createRun(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  stage: WorkflowRun['stage'],
  options: { readonly includeSpec: boolean; readonly includePlan: boolean } = {
    includeSpec: false,
    includePlan: false,
  },
): Promise<WorkflowRun> {
  const created = await fixture.store.create({
    repositoryPath: fixture.projectRoot,
    goal: 'Workflow failure',
    modelProfile: 'openai',
    projectProfile: createProjectProfile(fixture.projectRoot),
  });
  if (options.includeSpec) {
    await fixture.store.writeJson(created, 'spec.json', specification);
  }
  if (options.includePlan) {
    await fixture.store.writeJson(created, 'plan.json', plan);
  }
  const current = await fixture.store.read(created.id);
  return fixture.store.save({
    ...current,
    stage,
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
    verificationCommands: [],
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
