import { createHash } from 'node:crypto';

import type { ArtifactReference, ModelRuntime, RunStore, WorkflowRun } from '@bossflow/core';

import { CLI_EXIT_CODES, WorkflowService } from '../index.js';

describe('WorkflowService legacy optional metadata', () => {
  it('handles runs without materialized approvals, artifacts, or revision metadata', async () => {
    const store = new BareRunStore({
      stage: 'plan_approval',
      approvals: undefined,
      artifacts: undefined,
      workflowRevision: undefined,
    });
    const service = createService(store);

    expect((await service.status('run-1')).nextAction).toContain('bossflow approve');
    await expect(
      service.approve({
        runId: 'run-1',
        gate: 'plan',
        actions: [],
        actor: 'user',
      }),
    ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.MISSING_ARTIFACT });

    store.run = {
      ...store.run,
      artifacts: [createArtifact('plan.json', 'plan')],
    };
    const planApproved = await service.approve({
      runId: 'run-1',
      gate: 'plan',
      actions: [],
      actor: 'user',
    });
    expect(planApproved.approvals?.[0]).toMatchObject({ workflowRevision: 1 });

    store.run = {
      ...store.run,
      stage: 'build',
      approvals: undefined,
      artifacts: [createArtifact('plan.json', 'plan')],
    };
    await expect(
      service.resume({
        runId: 'run-1',
        modelRuntime: {
          provider: {},
          structuredOutputMode: 'native',
        } as unknown as ModelRuntime,
        redactionSecrets: [],
      }),
    ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.APPROVAL_REQUIRED });

    store.run = {
      ...store.run,
      stage: 'review_approval',
      approvals: undefined,
      artifacts: [createArtifact('review.json', 'review')],
    };
    const reviewApproved = await service.approve({
      runId: 'run-1',
      gate: 'review',
      actions: ['commit'],
      actor: 'user',
    });
    expect(reviewApproved.approvals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gate: 'review', workflowRevision: 1 }),
        expect.objectContaining({
          gate: 'external-action',
          workflowRevision: 1,
          actions: ['commit'],
        }),
      ]),
    );
  });
});

function createService(store: RunStore): WorkflowService {
  return new WorkflowService({
    store,
    implementer: async () => ({
      schemaVersion: 1,
      status: 'completed',
      summary: 'Implemented.',
      changedPaths: [],
      testChanges: [],
      notes: [],
    }),
    generateSpecification: async () => ({
      title: 'Legacy',
      problem: 'Legacy metadata.',
      scope: [],
      nonGoals: [],
      acceptanceCriteria: [],
      constraints: [],
    }),
    generateTechnicalPlan: async () => {
      throw new Error('not used');
    },
    generateReview: async () => {
      throw new Error('not used');
    },
    now: () => new Date('2026-11-03T00:00:00.000Z'),
    createId: () => 'approval-1',
  });
}

function createArtifact(fileName: string, kind: 'plan' | 'review'): ArtifactReference {
  return {
    kind,
    fileName,
    path: `/tmp/project/${fileName}`,
    createdAt: '2026-11-03T00:00:00.000Z',
    sha256: createHash('sha256').update('{}').digest('hex'),
  };
}

class BareRunStore implements RunStore {
  run: WorkflowRun;

  constructor(overrides: Partial<WorkflowRun>) {
    this.run = {
      schemaVersion: 1,
      id: 'run-1',
      repositoryPath: '/tmp/project',
      goal: 'Legacy run',
      modelProfile: 'openai',
      stage: 'spec',
      createdAt: '2026-11-03T00:00:00.000Z',
      updatedAt: '2026-11-03T00:00:00.000Z',
      ...overrides,
    };
  }

  async create(input: Parameters<RunStore['create']>[0]): Promise<WorkflowRun> {
    return {
      ...this.run,
      repositoryPath: input.repositoryPath,
      goal: input.goal,
      modelProfile: input.modelProfile,
    };
  }

  async read(): Promise<WorkflowRun> {
    return this.run;
  }

  async save(run: WorkflowRun): Promise<WorkflowRun> {
    this.run = run;
    return run;
  }

  async transition(
    _runId: string,
    stage: WorkflowRun['stage'],
    updatedAt: string,
  ): ReturnType<RunStore['transition']> {
    this.run = {
      ...this.run,
      stage,
      workflowRevision: (this.run.workflowRevision ?? 0) + 1,
      updatedAt,
    };
    return Promise.resolve({ ok: true, run: this.run });
  }

  async writeJson(): Promise<string> {
    return '/tmp/project/artifact.json';
  }

  async writeMarkdown(): Promise<string> {
    return '/tmp/project/artifact.md';
  }

  async readText(): Promise<string> {
    return '{}';
  }
}
