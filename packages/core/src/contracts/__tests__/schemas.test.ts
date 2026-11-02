import {
  ApprovalRecordSchema,
  RequirementCoverageSchema,
  TechnicalPlanSchema,
  WorkflowRunSchema,
} from '../../index.js';

describe('workflow contracts', () => {
  it('validates a technical plan with ordered tasks and verification commands', () => {
    const plan = TechnicalPlanSchema.parse({
      schemaVersion: 1,
      summary: 'Implement the approved workflow contracts.',
      affectedPaths: ['packages/core/src/contracts'],
      tasks: [
        {
          id: 'task-1',
          title: 'Add contracts',
          description: 'Define plan and verification contracts.',
          dependencies: [],
          affectedPaths: ['packages/core/src/contracts'],
          acceptanceCriteria: ['Contracts validate with Zod.'],
        },
      ],
      interfaceChanges: [],
      risks: [],
      verificationCommands: [
        {
          id: 'typecheck',
          label: 'Type check',
          command: 'pnpm',
          args: ['typecheck'],
          required: true,
          timeoutMs: 120000,
        },
      ],
    });

    expect(plan.tasks[0]?.id).toBe('task-1');
  });

  it('validates revision-aware approvals and requirement coverage', () => {
    expect(
      ApprovalRecordSchema.parse({
        id: 'approval-1',
        gate: 'plan',
        decision: 'approved',
        actor: 'user',
        decidedAt: '2026-11-02T00:00:00.000Z',
        workflowRevision: 2,
        artifactFileName: 'plan.json',
        artifactSha256: 'a'.repeat(64),
      }),
    ).toMatchObject({ gate: 'plan', workflowRevision: 2 });

    expect(
      RequirementCoverageSchema.parse({
        requirementId: 'workflow-runs:plan-approval',
        criterion: 'Build cannot start without approval.',
        status: 'covered',
        evidence: ['workflow test'],
      }),
    ).toMatchObject({ status: 'covered' });
  });

  it('backfills new run metadata when reading a legacy run document', () => {
    const run = WorkflowRunSchema.parse({
      schemaVersion: 1,
      id: 'legacy-run',
      repositoryPath: '/tmp/project',
      goal: 'Legacy goal',
      modelProfile: 'openai',
      stage: 'spec',
      createdAt: '2026-11-02T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
    });

    expect(run).toMatchObject({
      workflowRevision: 1,
      approvals: [],
      artifacts: [],
    });
  });
});
