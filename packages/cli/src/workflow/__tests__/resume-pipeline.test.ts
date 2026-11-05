import type { ImplementationWorktreeWorkspace, RunStore, WorkflowRun } from '@bossflow/core';

import { CLI_EXIT_CODES } from '../constant.js';
import { ResumePipeline } from '../resume-pipeline.js';
import type {
  WorkflowApprovalCoordinator,
  WorkflowEvidenceReader,
  WorkflowPlanningCoordinator,
} from '../types.js';

describe('ResumePipeline', () => {
  it('rejects a terminal Run passed through the Retry-prepared entrypoint', async () => {
    const pipeline = new ResumePipeline({
      store: {} as RunStore,
      implementer: async () => {
        throw new Error('not used');
      },
      worktreeManager: {} as ImplementationWorktreeWorkspace,
      evidence: {} as WorkflowEvidenceReader,
      approvals: {} as WorkflowApprovalCoordinator,
      planning: {} as WorkflowPlanningCoordinator,
      generateReview: async () => {
        throw new Error('not used');
      },
      now: () => new Date('2026-11-03T00:00:00.000Z'),
    });

    await expect(
      pipeline.resumePrepared(blockedRun(), {
        runId: 'run-1',
        redactionSecrets: [],
      }),
    ).rejects.toMatchObject({
      exitCode: CLI_EXIT_CODES.BLOCKED,
    });
  });
});

function blockedRun(): WorkflowRun {
  return {
    schemaVersion: 1,
    id: 'run-1',
    repositoryPath: '/tmp/project',
    goal: 'Blocked',
    modelProfile: 'openai',
    stage: 'blocked',
    createdAt: '2026-11-03T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  };
}
