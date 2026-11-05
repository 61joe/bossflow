import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  ApprovalRecord,
  ImplementationResult,
  TechnicalPlan,
  WorktreeMetadata,
} from '../../../contracts/index.js';
import type { WorkflowRun } from '../../../workflow/index.js';
import { FileRunStore } from '../../../run-store/index.js';
import type { ImplementationWorktreeWorkspace, WorktreeDiff } from '../../../index.js';

export const NOW = '2026-11-03T00:00:00.000Z';
export const WORKTREE: WorktreeMetadata = {
  path: '/tmp/bossflow-worktree',
  branch: 'bossflow/run-1',
  baseCommit: 'a'.repeat(40),
  createdAt: NOW,
  status: 'active',
};
export const PLAN: TechnicalPlan = {
  schemaVersion: 1,
  summary: 'Implement the approved change.',
  affectedPaths: ['src'],
  tasks: [
    {
      id: 'task-1',
      title: 'Implement',
      description: 'Modify the approved source.',
      dependencies: [],
      affectedPaths: ['src'],
      acceptanceCriteria: ['The change exists.'],
    },
  ],
  interfaceChanges: [],
  risks: [],
  verificationCommands: [
    {
      id: 'test',
      label: 'Test',
      command: 'pnpm',
      args: ['test'],
      required: true,
      timeoutMs: 120_000,
    },
  ],
};
export const RESULT: ImplementationResult = {
  schemaVersion: 1,
  status: 'completed',
  summary: 'Implemented the approved change.',
  changedPaths: ['src/index.ts'],
  testChanges: ['Added a test.'],
  notes: [],
};
export const SAFE_DIFF: WorktreeDiff = {
  trackedPaths: ['src/index.ts'],
  untrackedPaths: [],
  changedPaths: ['src/index.ts'],
  sensitivePaths: [],
  patch: 'diff --git a/src/index.ts b/src/index.ts\n+export const value = 1;\n',
};

export class FakeWorkspace implements ImplementationWorktreeWorkspace {
  diff: WorktreeDiff;
  statuses = [
    { isDirty: false, fingerprint: 'a'.repeat(64) },
    { isDirty: false, fingerprint: 'a'.repeat(64) },
  ];
  createCalls = 0;
  addedWorktrees = 0;

  constructor(diff: WorktreeDiff = SAFE_DIFF) {
    this.diff = diff;
  }

  async create(): Promise<WorktreeMetadata> {
    this.createCalls += 1;
    if (this.createCalls === 1) {
      this.addedWorktrees += 1;
    }
    return WORKTREE;
  }

  async readStatus() {
    return this.statuses.shift() ?? { isDirty: false, fingerprint: 'a'.repeat(64) };
  }

  async collectDiff(): Promise<WorktreeDiff> {
    return this.diff;
  }
}

export async function createApprovedRun(repositoryPath = '/tmp/project'): Promise<{
  readonly runsRoot: string;
  readonly store: FileRunStore;
  readonly run: WorkflowRun;
  readonly cleanup: () => Promise<void>;
}> {
  const runsRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-implementation-'));
  const store = new FileRunStore({ runsRoot });
  let run = await store.create({
    repositoryPath,
    goal: 'Implement approved plan',
    modelProfile: 'openai',
  });
  run = requireRun(await store.transition(run.id, 'plan', NOW));
  await store.writeJson(run, 'plan.json', PLAN);
  run = await store.read(run.id);
  run = requireRun(await store.transition(run.id, 'plan_approval', NOW));
  const planArtifact = run.artifacts?.find((artifact) => artifact.fileName === 'plan.json');
  if (planArtifact?.sha256 === undefined) {
    throw new Error('Expected plan artifact hash.');
  }
  const approval: ApprovalRecord = {
    id: 'approval-plan',
    gate: 'plan',
    decision: 'approved',
    actor: 'user',
    decidedAt: NOW,
    workflowRevision: run.workflowRevision as number,
    artifactFileName: planArtifact.fileName,
    artifactSha256: planArtifact.sha256,
  };
  run = await store.save({
    ...run,
    approvals: [...(run.approvals ?? []), approval],
    updatedAt: NOW,
  });
  return {
    runsRoot,
    store,
    run,
    cleanup: () => rm(runsRoot, { recursive: true, force: true }),
  };
}

function requireRun(result: Awaited<ReturnType<FileRunStore['transition']>>): WorkflowRun {
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.run;
}
