import { transitionWorkflow } from '../index.js';
import type { WorkflowRun } from '../index.js';

const baseRun: WorkflowRun = {
  schemaVersion: 1,
  id: 'run-1',
  repositoryPath: '/tmp/project',
  goal: 'Add export support',
  modelProfile: 'openai',
  stage: 'spec',
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
};

const planArtifact = {
  kind: 'plan' as const,
  fileName: 'plan.json',
  path: '/tmp/project/.bossflow/runs/run-1/plan.json',
  createdAt: '2026-11-02T00:00:00.000Z',
  sha256: 'a'.repeat(64),
};

describe('workflow approval gates', () => {
  it('requires a current plan approval before build', () => {
    const approvalGateRun: WorkflowRun = {
      ...baseRun,
      stage: 'plan_approval',
      workflowRevision: 2,
      approvals: [],
      artifacts: [],
    };

    expect(transitionWorkflow(approvalGateRun, 'build', '2026-11-02T00:02:00.000Z')).toMatchObject({
      ok: false,
      from: 'plan_approval',
      to: 'build',
    });
  });

  it('allows build with a matching approval and artifact hash', () => {
    const approvalGateRun: WorkflowRun = {
      ...baseRun,
      stage: 'plan_approval',
      workflowRevision: 2,
      approvals: [
        {
          id: 'approval-1',
          gate: 'plan',
          decision: 'approved',
          actor: 'user',
          decidedAt: '2026-11-02T00:01:00.000Z',
          workflowRevision: 2,
          artifactFileName: 'plan.json',
          artifactSha256: 'a'.repeat(64),
        },
      ],
      artifacts: [planArtifact],
    };

    const result = transitionWorkflow(approvalGateRun, 'build', '2026-11-02T00:02:00.000Z');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.stage).toBe('build');
      expect(result.run.workflowRevision).toBe(3);
    }
  });

  it('uses the latest approval decision for the current revision', () => {
    const approvalGateRun: WorkflowRun = {
      ...baseRun,
      stage: 'plan_approval',
      workflowRevision: 2,
      approvals: [
        {
          id: 'approval-1',
          gate: 'plan',
          decision: 'approved',
          actor: 'user',
          decidedAt: '2026-11-02T00:01:00.000Z',
          workflowRevision: 2,
          artifactFileName: 'plan.json',
          artifactSha256: 'a'.repeat(64),
        },
        {
          id: 'approval-2',
          gate: 'plan',
          decision: 'rejected',
          actor: 'user',
          decidedAt: '2026-11-02T00:02:00.000Z',
          workflowRevision: 2,
          artifactFileName: 'plan.json',
          artifactSha256: 'a'.repeat(64),
        },
      ],
      artifacts: [planArtifact],
    };

    expect(transitionWorkflow(approvalGateRun, 'build', '2026-11-02T00:03:00.000Z')).toMatchObject({
      ok: false,
      from: 'plan_approval',
      to: 'build',
    });
  });

  it('requires the approved hash to match the current review artifact', () => {
    const reviewGateRun: WorkflowRun = {
      ...baseRun,
      stage: 'review_approval',
      workflowRevision: 4,
      approvals: [
        {
          id: 'approval-review',
          gate: 'review',
          decision: 'approved',
          actor: 'user',
          decidedAt: '2026-11-02T00:01:00.000Z',
          workflowRevision: 4,
          artifactFileName: 'review.json',
          artifactSha256: 'a'.repeat(64),
        },
      ],
      artifacts: [
        {
          kind: 'review',
          fileName: 'review.json',
          path: '/tmp/project/.bossflow/runs/run-1/review.json',
          createdAt: '2026-11-02T00:00:00.000Z',
          sha256: 'b'.repeat(64),
        },
      ],
    };

    expect(
      transitionWorkflow(reviewGateRun, 'completed', '2026-11-02T00:02:00.000Z'),
    ).toMatchObject({ ok: false, from: 'review_approval', to: 'completed' });
  });
});
