import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RetryCoordinator } from '../index.js';
import type { RetryError } from '../index.js';
import { FileRunStore } from '../../run-store/index.js';
import type {
  ArtifactReference,
  ApprovalRecord,
  ProjectProfile,
  ImplementationWorktreeWorkspace,
  RunStore,
  TechnicalPlan,
  WorktreeDiff,
  WorktreeMetadata,
  WorkflowRun,
} from '../../index.js';

const NOW = '2026-11-03T00:00:00.000Z';
const PLAN: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Retry',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Retry',
      description: 'Retry the run.',
      dependencies: [],
      affectedPaths: ['src'],
      acceptanceCriteria: ['The retry is guarded.'],
    },
  ],
  interfaceChanges: [],
  risks: [],
  verificationCommands: [
    {
      id: 'test',
      label: 'Test',
      command: 'node',
      args: ['--version'],
      required: true,
      timeoutMs: 1_000,
    },
  ],
};

describe('RetryCoordinator inspection', () => {
  it('rejects nonterminal inspection and reports a missing Plan approval', async () => {
    const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-retry-coordinator-'));
    const store = new FileRunStore({ runsRoot });

    try {
      const active = await store.create({
        repositoryPath: '/tmp/project',
        goal: 'Active',
        modelProfile: 'openai',
      });
      const coordinator = new RetryCoordinator({
        store,
        worktreeManager: new FakeWorkspace(),
      });
      await expect(coordinator.inspect(active.id)).resolves.toMatchObject({
        build: { available: false },
        verify: { available: false },
      });

      let blocked = await store.transition(active.id, 'plan', NOW);
      if (!blocked.ok) {
        throw new Error(blocked.reason);
      }
      await store.writeJson(blocked.run, 'plan.json', PLAN);
      blocked = await store.transition(active.id, 'plan_approval', NOW);
      if (!blocked.ok) {
        throw new Error(blocked.reason);
      }
      const current = await store.save({
        ...blocked.run,
        stage: 'blocked',
        updatedAt: new Date(Date.parse(blocked.run.updatedAt) + 1_000).toISOString(),
      });
      await expect(coordinator.inspect(current.id)).resolves.toMatchObject({
        build: {
          available: false,
          reason: expect.stringContaining('no matching approval'),
        },
      });
      await expect(
        coordinator.prepare({
          run: current,
          from: 'build',
        }),
      ).rejects.toEqual(
        expect.objectContaining<Partial<RetryError>>({
          code: 'approval-required',
        }),
      );
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('uses legacy defaults and stringifies non-Error inspection failures', async () => {
    const planContent = JSON.stringify(PLAN);
    const planArtifact = artifact('plan.json', 'plan', planContent);
    const run: WorkflowRun = {
      schemaVersion: 1,
      id: 'run-1',
      repositoryPath: '/tmp/project',
      goal: 'Retry',
      modelProfile: 'openai',
      stage: 'blocked',
      approvals: [approval(planArtifact)],
      worktree: worktree(),
      artifacts: [planArtifact],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const store = new MemoryRetryStore(run, planContent);
    const coordinator = new RetryCoordinator({
      store,
      worktreeManager: new FakeWorkspace(),
    });

    await expect(coordinator.prepare({ run, from: 'build' })).resolves.toMatchObject({
      stage: 'build',
      attempt: 2,
    });
    expect(store.retryOptions).toMatchObject({
      expectedAttempt: 1,
      expectedWorkflowRevision: 1,
    });

    store.run = {
      ...run,
      approvals: undefined,
    };
    await expect(coordinator.inspect(run.id)).resolves.toMatchObject({
      build: {
        available: false,
        reason: expect.stringContaining('no matching approval'),
      },
    });

    store.run = run;
    const failingWorkspace = new FakeWorkspace();
    failingWorkspace.readStatusError = 'repository unavailable';
    await expect(
      new RetryCoordinator({ store, worktreeManager: failingWorkspace }).inspect(run.id),
    ).resolves.toMatchObject({
      build: {
        available: false,
        reason: 'repository unavailable',
      },
    });
  });
});

class FakeWorkspace implements ImplementationWorktreeWorkspace {
  readStatusError?: unknown;

  async create(): Promise<WorktreeMetadata> {
    return worktree();
  }

  async readStatus() {
    if (this.readStatusError !== undefined) {
      throw this.readStatusError;
    }
    return { isDirty: false, fingerprint: 'a'.repeat(64) };
  }

  async collectDiff(): Promise<WorktreeDiff> {
    return {
      trackedPaths: [],
      untrackedPaths: [],
      changedPaths: [],
      sensitivePaths: [],
      patch: '',
    };
  }
}

class MemoryRetryStore implements RunStore {
  run: WorkflowRun;
  retryOptions: Record<string, unknown> | undefined;
  readonly #planContent: string;

  constructor(run: WorkflowRun, planContent: string) {
    this.run = run;
    this.#planContent = planContent;
  }

  async create(): Promise<WorkflowRun> {
    return this.run;
  }

  async read(): Promise<WorkflowRun> {
    return this.run;
  }

  async save(run: WorkflowRun): Promise<WorkflowRun> {
    this.run = run;
    return run;
  }

  async transition(): ReturnType<RunStore['transition']> {
    throw new Error('not used');
  }

  async writeJson(): Promise<string> {
    throw new Error('not used');
  }

  async writeMarkdown(): Promise<string> {
    throw new Error('not used');
  }

  async readText(): Promise<string> {
    return this.#planContent;
  }

  async beginRetry(
    _runId: string,
    options: {
      readonly target: 'build' | 'verify';
      readonly expectedAttempt: number;
      readonly expectedWorkflowRevision: number;
      readonly expectedUpdatedAt: string;
      readonly evidenceFileNames: readonly string[];
      readonly updatedAt: string;
      readonly projectProfile?: ProjectProfile | undefined;
    },
  ): Promise<WorkflowRun> {
    this.retryOptions = options;
    this.run = {
      ...this.run,
      stage: options.target,
      attempt: options.expectedAttempt + 1,
      workflowRevision: options.expectedWorkflowRevision + 1,
      updatedAt: options.updatedAt,
    };
    return this.run;
  }
}

function artifact(fileName: string, kind: 'plan', content: string): ArtifactReference {
  return {
    kind,
    fileName,
    path: `/tmp/project/${fileName}`,
    createdAt: NOW,
    sizeBytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function approval(plan: ArtifactReference): ApprovalRecord {
  return {
    id: 'approval-plan',
    gate: 'plan',
    decision: 'approved',
    actor: 'user',
    decidedAt: NOW,
    workflowRevision: 1,
    artifactFileName: plan.fileName,
    artifactSha256: plan.sha256,
  };
}

function worktree(): WorktreeMetadata {
  return {
    path: '/tmp/worktree',
    branch: 'bossflow/run-run-1',
    baseCommit: 'a'.repeat(40),
    createdAt: NOW,
    repositoryFingerprint: 'a'.repeat(64),
    status: 'active',
  };
}
