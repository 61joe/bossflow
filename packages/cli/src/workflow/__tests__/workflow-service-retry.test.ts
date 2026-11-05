/* eslint-disable max-lines, max-lines-per-function -- Retry scenarios share one persisted Run fixture. */
import { jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FileRunStore } from '@bossflow/core';
import type {
  ImplementationWorktreeWorkspace,
  ModelRuntime,
  ProjectProfile,
  ReviewerAgentInput,
  TechnicalPlan,
  WorktreeDiff,
  WorktreeMetadata,
  WorkflowRun,
} from '@bossflow/core';

import { CLI_EXIT_CODES, WorkflowService } from '../index.js';

const NOW = '2026-11-03T00:00:00.000Z';
const FINGERPRINT = 'a'.repeat(64);
const PATCH = 'diff --git a/src/index.ts b/src/index.ts\n+implemented\n';
const RUNTIME = {
  provider: {},
  structuredOutputMode: 'native',
} as unknown as ModelRuntime;
const BASE_COMMAND = {
  id: 'test',
  label: 'Test',
  command: 'node',
  args: ['-e', 'process.exit(0)'],
  required: true,
  timeoutMs: 1_000,
} as const;
const BROWSER_COMMAND = {
  id: 'browser',
  label: 'Browser',
  command: 'node',
  args: ['-e', 'process.exit(0)'],
  required: true,
  timeoutMs: 1_000,
} as const;
const LINT_COMMAND = {
  id: 'lint',
  label: 'Lint',
  command: 'node',
  args: ['-e', 'process.exit(0)'],
  required: true,
  timeoutMs: 1_000,
} as const;
const PLAN: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Retry implementation.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Implement source',
      description: 'Change source.',
      dependencies: [],
      affectedPaths: ['src'],
      acceptanceCriteria: ['Tests pass.'],
    },
  ],
  interfaceChanges: [],
  risks: [],
  verificationCommands: [BASE_COMMAND, BROWSER_COMMAND, LINT_COMMAND],
};

describe('WorkflowService retry', () => {
  it('retries Build, archives prior evidence, and adopts a Plan command', async () => {
    const fixture = await createBlockedRun();

    try {
      expect((await fixture.service.status(fixture.run.id)).nextAction).toContain('--from verify');
      const retried = await fixture.service.retry({
        runId: fixture.run.id,
        from: 'build',
        modelRuntime: RUNTIME,
        redactionSecrets: [],
        verificationCommandIds: ['browser'],
      });
      expect(retried).toMatchObject({
        stage: 'review_approval',
        attempt: 2,
      });
      expect(retried.approvals).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ gate: 'external-action' })]),
      );
      await expect(
        fixture.service.resume({
          runId: fixture.run.id,
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.APPROVAL_REQUIRED });
      expect(retried.projectProfile?.verificationCommands.map((command) => command.id)).toEqual([
        'test',
        'browser',
      ]);
      const runDirectory = path.join(fixture.runsRoot, fixture.run.id);
      const verification = JSON.parse(
        await readFile(path.join(runDirectory, 'verification.json'), 'utf8'),
      );
      expect(
        verification.records.map((record: { command: { id: string } }) => record.command.id),
      ).toEqual(['test', 'browser']);
      expect(fixture.reviewerInputs.at(-1)?.verificationContext?.advisoryPlanCommands).toEqual([
        LINT_COMMAND,
      ]);
      await expect(
        readFile(path.join(runDirectory, 'attempt-1-implementation.json'), 'utf8'),
      ).resolves.toContain('"status": "completed"');
      await expect(
        readFile(path.join(runDirectory, 'attempt-1-verification.json'), 'utf8'),
      ).resolves.toContain('"status": "failed"');
      const implementation = JSON.parse(
        await readFile(path.join(runDirectory, 'implementation.json'), 'utf8'),
      );
      expect(implementation).toMatchObject({
        runId: fixture.run.id,
        result: { status: 'completed' },
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it('retries Verify only when the Worktree still matches accepted implementation evidence', async () => {
    const fixture = await createBlockedRun();

    try {
      const retried = await fixture.service.retry({
        runId: fixture.run.id,
        from: 'verify',
        modelRuntime: RUNTIME,
        redactionSecrets: [],
        verificationCommandIds: ['browser'],
      });
      expect(retried).toMatchObject({ stage: 'review_approval', attempt: 2 });
      const runDirectory = path.join(fixture.runsRoot, fixture.run.id);
      await expect(
        readFile(path.join(runDirectory, 'attempt-1-verification.json'), 'utf8'),
      ).resolves.toContain('"status": "failed"');
      await expect(
        readFile(path.join(runDirectory, 'attempt-1-review.json'), 'utf8'),
      ).resolves.toContain('Previous Review');
      await expect(
        readFile(path.join(runDirectory, 'implementation.json'), 'utf8'),
      ).resolves.toContain('"status": "completed"');
    } finally {
      await fixture.cleanup();
    }
  });

  it('reconstructs a legacy main-worktree fingerprint from the recorded baseline', async () => {
    const fixture = await createBlockedRun();
    const current = await fixture.store.read(fixture.run.id);
    if (current.worktree === undefined) {
      throw new Error('Expected a Worktree fixture.');
    }
    await fixture.store.save({
      ...current,
      worktree: {
        ...current.worktree,
        repositoryFingerprint: undefined,
      },
      updatedAt: new Date(Date.parse(current.updatedAt) + 1_000).toISOString(),
    });
    fixture.workspace.fingerprint = createHash('sha256')
      .update(`\0${current.worktree.baseCommit}\0main`)
      .digest('hex');

    try {
      expect((await fixture.service.status(fixture.run.id)).nextAction).toContain('--from verify');
      await expect(
        fixture.service.retry({
          runId: fixture.run.id,
          from: 'build',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).resolves.toMatchObject({ stage: 'review_approval', attempt: 2 });
    } finally {
      await fixture.cleanup();
    }
  });

  it('retries Verify when the accepted implementation has no patch', async () => {
    const fixture = await createBlockedRun();
    const current = await fixture.store.read(fixture.run.id);
    const record = JSON.parse(
      await readFile(path.join(fixture.runsRoot, fixture.run.id, 'implementation.json'), 'utf8'),
    );
    const {
      patchFileName: _patchFileName,
      patchSha256: _patchSha256,
      ...recordWithoutPatch
    } = record;
    void _patchFileName;
    void _patchSha256;
    await fixture.store.writeJson(current, 'implementation.json', recordWithoutPatch);
    const withoutPatch = await fixture.store.read(fixture.run.id);
    await fixture.store.save({
      ...withoutPatch,
      artifacts: withoutPatch.artifacts?.filter(
        (artifact) => artifact.fileName !== 'implementation.patch',
      ),
      updatedAt: new Date(Date.parse(withoutPatch.updatedAt) + 1_000).toISOString(),
    });
    fixture.workspace.diff = { ...fixture.workspace.diff, patch: '' };

    try {
      expect((await fixture.service.status(fixture.run.id)).nextAction).toContain('--from verify');
      await expect(
        fixture.service.retry({
          runId: fixture.run.id,
          from: 'verify',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).resolves.toMatchObject({ stage: 'review_approval', attempt: 2 });
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects Verify retry after Worktree code changes', async () => {
    const fixture = await createBlockedRun();
    fixture.workspace.diff = { ...fixture.workspace.diff, patch: `${PATCH}changed\n` };

    try {
      expect((await fixture.service.status(fixture.run.id)).nextAction).toContain('--from build');
      await expect(
        fixture.service.retry({
          runId: fixture.run.id,
          from: 'verify',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.BLOCKED });
      const unchanged = await fixture.store.read(fixture.run.id);
      expect(unchanged).toMatchObject({ stage: 'blocked', attempt: 1 });
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects retry when the main repository changed', async () => {
    const fixture = await createBlockedRun();
    fixture.workspace.fingerprint = 'b'.repeat(64);

    try {
      expect((await fixture.service.status(fixture.run.id)).nextAction).toContain('Inspect');
      await expect(
        fixture.service.retry({
          runId: fixture.run.id,
          from: 'build',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toThrow('main worktree changed');
    } finally {
      await fixture.cleanup();
    }
  });

  it('propagates retry claim failures without changing the blocked run', async () => {
    const fixture = await createBlockedRun();
    jest.spyOn(fixture.store, 'beginRetry').mockRejectedValueOnce(new Error('retry claim failed'));

    try {
      await expect(
        fixture.service.retry({
          runId: fixture.run.id,
          from: 'build',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toThrow('retry claim failed');
      expect(await fixture.store.read(fixture.run.id)).toMatchObject({
        stage: 'blocked',
        attempt: 1,
      });
    } finally {
      jest.restoreAllMocks();
      await fixture.cleanup();
    }
  });

  it('rejects modified, unaccepted, or unindexed accepted implementation evidence', async () => {
    const modified = await createBlockedRun();
    try {
      const implementationPath = path.join(
        modified.runsRoot,
        modified.run.id,
        'implementation.json',
      );
      await writeFile(implementationPath, `${await readFile(implementationPath, 'utf8')} `, 'utf8');
      await expect(
        modified.service.retry({
          runId: modified.run.id,
          from: 'verify',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.FAILED });
    } finally {
      await modified.cleanup();
    }

    for (const field of ['sensitivePaths', 'unexpectedPaths'] as const) {
      const unaccepted = await createBlockedRun();
      try {
        expect((await unaccepted.service.status(unaccepted.run.id)).nextAction).toContain(
          '--from verify',
        );
        const current = await unaccepted.store.read(unaccepted.run.id);
        const record = JSON.parse(
          await readFile(
            path.join(unaccepted.runsRoot, unaccepted.run.id, 'implementation.json'),
            'utf8',
          ),
        );
        await unaccepted.store.writeJson(current, 'implementation.json', {
          ...record,
          [field]: ['outside.txt'],
        });
        expect((await unaccepted.service.status(unaccepted.run.id)).nextAction).toContain(
          '--from build',
        );
        await expect(
          unaccepted.service.retry({
            runId: unaccepted.run.id,
            from: 'verify',
            modelRuntime: RUNTIME,
            redactionSecrets: [],
          }),
        ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.BLOCKED });
      } finally {
        await unaccepted.cleanup();
      }
    }

    const missingPatch = await createBlockedRun();
    try {
      const current = await missingPatch.store.read(missingPatch.run.id);
      await missingPatch.store.save({
        ...current,
        artifacts: current.artifacts?.filter(
          (artifact) => artifact.fileName !== 'implementation.patch',
        ),
        updatedAt: new Date(Date.parse(current.updatedAt) + 1_000).toISOString(),
      });
      await expect(
        missingPatch.service.retry({
          runId: missingPatch.run.id,
          from: 'verify',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.FAILED });
    } finally {
      await missingPatch.cleanup();
    }
  });

  it('rejects retry with a foreign Worktree branch or stale approved Plan', async () => {
    const fixture = await createBlockedRun();

    try {
      const current = await fixture.store.read(fixture.run.id);
      if (current.worktree === undefined) {
        throw new Error('Expected a Worktree fixture.');
      }
      await fixture.store.save({
        ...current,
        worktree: {
          ...current.worktree,
          branch: 'bossflow/run-different',
        },
        updatedAt: new Date(Date.parse(current.updatedAt) + 1_000).toISOString(),
      });
      await expect(
        fixture.service.retry({
          runId: fixture.run.id,
          from: 'build',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toThrow('not owned by this run');
    } finally {
      await fixture.cleanup();
    }

    const stalePlan = await createBlockedRun();
    try {
      await writeFile(
        path.join(stalePlan.runsRoot, stalePlan.run.id, 'plan.json'),
        JSON.stringify({ ...PLAN, summary: 'Changed after approval.' }),
        'utf8',
      );
      await expect(
        stalePlan.service.retry({
          runId: stalePlan.run.id,
          from: 'build',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.FAILED });
    } finally {
      await stalePlan.cleanup();
    }
  });

  it.each([
    ['active', { stage: 'build' as const }],
    ['completed', { stage: 'completed' as const }],
  ])('rejects retry from a %s run', async (_name, overrides) => {
    const fixture = await createBlockedRun();

    try {
      await fixture.store.save({
        ...fixture.run,
        ...overrides,
        updatedAt: new Date(Date.now() + 1_000).toISOString(),
      });
      await expect(
        fixture.service.retry({
          runId: fixture.run.id,
          from: 'build',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.APPROVAL_REQUIRED });
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects retry without an owned active Worktree or accepted implementation', async () => {
    const noWorktree = await createBlockedRun(false);
    try {
      expect((await noWorktree.service.status(noWorktree.run.id)).nextAction).toContain('Inspect');
      await expect(
        noWorktree.service.retry({
          runId: noWorktree.run.id,
          from: 'build',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.BLOCKED });
    } finally {
      await noWorktree.cleanup();
    }

    const missingImplementation = await createBlockedRun(true, false);
    try {
      await expect(
        missingImplementation.service.retry({
          runId: missingImplementation.run.id,
          from: 'verify',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.MISSING_ARTIFACT });
    } finally {
      await missingImplementation.cleanup();
    }
  });

  it('rejects retry when project verification metadata is unavailable', async () => {
    const fixture = await createBlockedRun();
    const current = await fixture.store.read(fixture.run.id);
    await fixture.store.save({
      ...current,
      projectProfile: undefined,
      updatedAt: new Date(Date.parse(current.updatedAt) + 1_000).toISOString(),
    });

    try {
      await expect(
        fixture.service.retry({
          runId: fixture.run.id,
          from: 'build',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toThrow('no verification commands');
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects retry when the main repository baseline cannot be reconstructed', async () => {
    const fixture = await createBlockedRun();
    const current = await fixture.store.read(fixture.run.id);
    if (current.worktree === undefined) {
      throw new Error('Expected a Worktree fixture.');
    }
    await fixture.store.save({
      ...current,
      projectProfile: undefined,
      worktree: {
        ...current.worktree,
        repositoryFingerprint: undefined,
      },
      updatedAt: new Date(Date.parse(current.updatedAt) + 1_000).toISOString(),
    });

    try {
      await expect(
        fixture.service.retry({
          runId: fixture.run.id,
          from: 'build',
          modelRuntime: RUNTIME,
          redactionSecrets: [],
        }),
      ).rejects.toMatchObject({ exitCode: CLI_EXIT_CODES.MISSING_ARTIFACT });
    } finally {
      await fixture.cleanup();
    }
  });

  it('falls back to Build retry when status cannot parse implementation evidence', async () => {
    const fixture = await createBlockedRun();
    await writeFile(
      path.join(fixture.runsRoot, fixture.run.id, 'implementation.json'),
      '{"invalid":true}',
      'utf8',
    );

    try {
      expect((await fixture.service.status(fixture.run.id)).nextAction).toContain('--from build');
    } finally {
      await fixture.cleanup();
    }
  });
});

async function createBlockedRun(includeWorktree = true, includeImplementation = true) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-retry-'));
  const runsRoot = path.join(projectRoot, '.bossflow', 'runs');
  const workspaceRoot = path.join(projectRoot, 'worktrees');
  await mkdir(workspaceRoot, { recursive: true });
  const store = new FileRunStore({ runsRoot });
  const profile = createProjectProfile(projectRoot);
  let run = await store.create({
    repositoryPath: projectRoot,
    goal: 'Retry controlled workflow',
    modelProfile: 'openai',
    projectProfile: profile,
  });
  await store.writeJson(run, 'spec.json', {
    title: 'Retry workflow',
    problem: 'Retry an accepted implementation.',
    scope: ['Retry implementation'],
    nonGoals: [],
    acceptanceCriteria: ['Tests pass.'],
    constraints: [],
  });
  run = requireTransition(await store.transition(run.id, 'plan', NOW));
  await store.writeJson(run, 'plan.json', PLAN);
  run = await store.read(run.id);
  run = requireTransition(await store.transition(run.id, 'plan_approval', NOW));
  const planArtifact = run.artifacts?.find((artifact) => artifact.fileName === 'plan.json');
  if (planArtifact?.sha256 === undefined) {
    throw new Error('Expected Plan artifact.');
  }
  run = await store.save({
    ...run,
    approvals: [
      {
        id: 'plan-approval',
        gate: 'plan',
        decision: 'approved',
        actor: 'user',
        decidedAt: NOW,
        workflowRevision: run.workflowRevision ?? 1,
        artifactFileName: 'plan.json',
        artifactSha256: planArtifact.sha256,
      },
    ],
    updatedAt: new Date(Date.parse(run.updatedAt) + 1_000).toISOString(),
  });
  run = requireTransition(
    await store.transition(
      run.id,
      'build',
      new Date(Date.parse(run.updatedAt) + 1_000).toISOString(),
    ),
  );
  const worktreePath = path.join(workspaceRoot, run.id);
  await mkdir(worktreePath, { recursive: true });
  run = await store.save({
    ...run,
    ...(includeWorktree
      ? {
          worktree: {
            path: worktreePath,
            branch: `bossflow/run-${run.id}`,
            baseCommit: 'b'.repeat(40),
            createdAt: NOW,
            repositoryFingerprint: FINGERPRINT,
            status: 'active' as const,
          },
        }
      : {}),
    updatedAt: new Date(Date.parse(run.updatedAt) + 1_000).toISOString(),
  });

  if (includeImplementation) {
    await store.writeMarkdown(run, 'implementation.patch', PATCH);
    await store.writeJson(run, 'implementation.json', {
      schemaVersion: 1,
      runId: run.id,
      result: {
        schemaVersion: 1,
        status: 'completed',
        summary: 'Previously implemented.',
        changedPaths: ['src/index.ts'],
        testChanges: [],
        notes: [],
      },
      baseCommit: 'b'.repeat(40),
      changedPaths: ['src/index.ts'],
      sensitivePaths: [],
      unexpectedPaths: [],
      patchFileName: 'implementation.patch',
      patchSha256: sha256(PATCH),
    });
    await store.writeMarkdown(run, 'implementation.md', '# Previous Implementation\n');
  }
  await writePreviousDownstreamEvidence(store, run);
  const workspace = new FakeWorkspace(workspaceRoot);
  const reviewerInputs: ReviewerAgentInput[] = [];
  const blocked = await store.save({
    ...(await store.read(run.id)),
    stage: 'blocked',
    updatedAt: new Date(Date.now() + 1_000).toISOString(),
  });
  return {
    store,
    runsRoot,
    workspace,
    reviewerInputs,
    run: blocked,
    service: createService(store, workspace, reviewerInputs),
    cleanup: () => rm(projectRoot, { recursive: true, force: true }),
  };
}

function createService(
  store: FileRunStore,
  workspace: FakeWorkspace,
  reviewerInputs: ReviewerAgentInput[],
) {
  return new WorkflowService({
    store,
    implementer: async () => ({
      schemaVersion: 1,
      status: 'completed',
      summary: 'Retried implementation.',
      changedPaths: [],
      testChanges: [],
      notes: [],
    }),
    worktreeManager: workspace,
    generateReview: async (input) => {
      reviewerInputs.push(input);
      return {
        schemaVersion: 1,
        summary: 'Retry review ready.',
        findings: [],
        requirementCoverage: [
          {
            requirementId: 'acceptance-1',
            criterion: 'Tests pass.',
            status: 'covered',
            evidence: ['retry verification passed'],
          },
        ],
        unresolvedFindingIds: [],
      };
    },
    now: () => new Date(Date.now() + 2_000),
    createId: () => 'review-approval',
  });
}

async function writePreviousDownstreamEvidence(store: FileRunStore, run: WorkflowRun) {
  await store.writeJson(run, 'verification.json', {
    schemaVersion: 1,
    runId: run.id,
    status: 'failed',
    records: [],
    startedAt: NOW,
    endedAt: NOW,
  });
  await store.writeMarkdown(run, 'verification.md', '# Previous Verification\n');
  await store.writeJson(run, 'review.json', {
    schemaVersion: 1,
    summary: 'Previous Review',
    findings: [],
    requirementCoverage: [
      {
        requirementId: 'acceptance-1',
        criterion: 'Tests pass.',
        status: 'covered',
        evidence: ['previous review evidence'],
      },
    ],
    unresolvedFindingIds: [],
  });
  await store.writeMarkdown(run, 'review.md', '# Previous Review\n');
  await store.writeJson(run, 'summary.json', { status: 'blocked' });
  await store.writeMarkdown(run, 'summary.md', '# Previous Summary\n');
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
    verificationCommands: [BASE_COMMAND],
    ambiguities: [],
    requiresConfirmation: false,
    confirmedByUser: true,
  };
}

class FakeWorkspace implements ImplementationWorktreeWorkspace {
  readonly #root: string;
  fingerprint = FINGERPRINT;
  diff: WorktreeDiff = {
    trackedPaths: ['src/index.ts'],
    untrackedPaths: [],
    changedPaths: ['src/index.ts'],
    sensitivePaths: [],
    patch: PATCH,
  };

  constructor(root: string) {
    this.#root = root;
  }

  async create(
    options: Parameters<ImplementationWorktreeWorkspace['create']>[0],
  ): Promise<WorktreeMetadata> {
    const worktreePath = path.join(this.#root, options.runId);
    await mkdir(worktreePath, { recursive: true });
    return {
      path: worktreePath,
      branch: `bossflow/run-${options.runId}`,
      baseCommit: 'b'.repeat(40),
      createdAt: NOW,
      repositoryFingerprint: this.fingerprint,
      status: 'active',
    };
  }

  async readStatus() {
    return { isDirty: false, fingerprint: this.fingerprint };
  }

  async collectDiff(): Promise<WorktreeDiff> {
    return this.diff;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requireTransition(result: Awaited<ReturnType<FileRunStore['transition']>>) {
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.run;
}
