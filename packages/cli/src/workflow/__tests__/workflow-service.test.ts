import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '@bossflow/core';
import type {
  ImplementationWorktreeWorkspace,
  ModelRuntime,
  ProjectProfile,
  TechnicalPlan,
  WorktreeDiff,
} from '@bossflow/core';

import { WorkflowService } from '../index.js';

const specification = {
  title: 'Workflow service',
  problem: 'Run the controlled workflow.',
  scope: ['Implement and review'],
  nonGoals: [],
  acceptanceCriteria: ['Tests pass'],
  constraints: [],
};

const plan: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Implement the workflow.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Implement source',
      description: 'Create source.',
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

describe('WorkflowService', () => {
  it('runs implementation, verification, and review before completing review approval', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-workflow-service-'));
    const runsRoot = path.join(projectRoot, '.bossflow', 'runs');
    const worktreesRoot = path.join(projectRoot, 'worktrees');
    await mkdir(worktreesRoot, { recursive: true });
    const store = new FileRunStore({ runsRoot });
    let id = 0;
    const service = new WorkflowService({
      store,
      implementer: async () => ({
        schemaVersion: 1,
        status: 'completed',
        summary: 'Implemented.',
        changedPaths: ['src/index.ts'],
        testChanges: ['Updated tests.'],
        notes: ['Credential placeholder-key must not persist.'],
      }),
      worktreeManager: new FakeWorktreeWorkspace(worktreesRoot),
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
            evidence: ['verification test passed'],
          },
        ],
        unresolvedFindingIds: [],
      }),
      createId: () => `approval-${++id}`,
      now: () => new Date('2026-11-03T00:00:00.000Z'),
    });
    const runtime = {
      provider: {},
      structuredOutputMode: 'native',
    } as unknown as ModelRuntime;
    const projectProfile = createProjectProfile(projectRoot);

    try {
      const created = await service.run({
        goal: 'Implement controlled workflow',
        projectContext: { profile: projectProfile, documents: [] },
        modelRuntime: runtime,
        modelProfile: 'openai',
        confirmedProject: true,
        stopAfterSpec: false,
      });
      await service.approve({
        runId: created.run.id,
        gate: 'plan',
        actions: [],
        actor: 'user',
      });

      const reviewed = await service.resume({
        runId: created.run.id,
        modelRuntime: runtime,
        redactionSecrets: ['placeholder-key'],
      });
      expect(reviewed.stage).toBe('review_approval');
      await expect(
        readFile(path.join(runsRoot, created.run.id, 'implementation.json'), 'utf8'),
      ).resolves.not.toContain('placeholder-key');
      const status = await service.status(created.run.id);
      expect(status.verificationLine).toContain('passed');
      expect(status.reviewLine).toContain('0 unresolved findings');
      expect(status.artifactLines[0]).not.toContain('undefined');
      const withMissingSizes = await store.read(created.run.id);
      await store.save({
        ...withMissingSizes,
        artifacts: withMissingSizes.artifacts?.map((artifact) => ({
          ...artifact,
          sizeBytes: undefined,
        })),
      });
      expect((await service.status(created.run.id)).artifactLines[0]).toContain('(0 bytes)');

      await service.approve({
        runId: created.run.id,
        gate: 'review',
        actions: ['commit'],
        actor: 'user',
      });
      const completed = await service.resume({
        runId: created.run.id,
        modelRuntime: runtime,
        redactionSecrets: ['placeholder-key'],
      });
      expect(completed.stage).toBe('completed');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

class FakeWorktreeWorkspace implements ImplementationWorktreeWorkspace {
  readonly #createdAt = '2026-11-03T00:00:00.000Z';
  readonly #fingerprint = 'a'.repeat(64);
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
      createdAt: this.#createdAt,
      status: 'active' as const,
    };
  }

  async readStatus() {
    return { isDirty: false, fingerprint: this.#fingerprint };
  }

  async collectDiff(): Promise<WorktreeDiff> {
    return {
      trackedPaths: ['src/index.ts'],
      untrackedPaths: [],
      changedPaths: ['src/index.ts'],
      sensitivePaths: [],
      patch: 'diff --git a/src/index.ts b/src/index.ts\n+implemented\n',
    };
  }
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
