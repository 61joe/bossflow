import {
  ApprovalRecordSchema,
  ImplementationResultSchema,
  RequirementCoverageSchema,
  ReviewResultSchema,
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

  it('allows external-action approvals without artifact metadata', () => {
    expect(
      ApprovalRecordSchema.parse({
        id: 'external-approval',
        gate: 'external-action',
        decision: 'approved',
        actor: 'user',
        decidedAt: '2026-11-02T00:00:00.000Z',
        workflowRevision: 4,
      }),
    ).toMatchObject({ gate: 'external-action' });
  });

  it('rejects plan approvals without artifact metadata', () => {
    expect(() =>
      ApprovalRecordSchema.parse({
        id: 'invalid-plan-approval',
        gate: 'plan',
        decision: 'approved',
        actor: 'user',
        decidedAt: '2026-11-02T00:00:00.000Z',
        workflowRevision: 2,
      }),
    ).toThrow('must include');
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

describe('requirement coverage contracts', () => {
  it('requires evidence for covered and partial requirement mappings', () => {
    expect(() =>
      RequirementCoverageSchema.parse({
        requirementId: 'workflow-runs:plan-approval',
        criterion: 'Build cannot start without approval.',
        status: 'covered',
        evidence: [],
      }),
    ).toThrow('must include at least one evidence item');
    expect(
      RequirementCoverageSchema.parse({
        requirementId: 'workflow-runs:plan-approval',
        criterion: 'Build cannot start without approval.',
        status: 'missing',
        evidence: [],
      }),
    ).toMatchObject({ status: 'missing' });
  });
});

describe('specialist agent contracts', () => {
  it('validates implementation results', () => {
    expect(
      ImplementationResultSchema.parse({
        schemaVersion: 1,
        status: 'completed',
        summary: 'Implemented the scoped change.',
        changedPaths: ['packages/core/src/agents'],
        testChanges: ['Added focused tests.'],
        notes: [],
      }),
    ).toMatchObject({ status: 'completed' });
  });

  it('validates unresolved review findings and rejects unknown references', () => {
    const review = {
      schemaVersion: 1,
      summary: 'Review found an issue.',
      findings: [
        {
          id: 'finding-1',
          severity: 'P1',
          title: 'Missing guard',
          description: 'A path guard is missing.',
          status: 'open',
        },
      ],
      requirementCoverage: [
        {
          requirementId: 'workflow-runs:specialists',
          criterion: 'Findings include severity.',
          status: 'partial',
          evidence: ['review test'],
        },
      ],
      unresolvedFindingIds: ['finding-1'],
    };

    expect(ReviewResultSchema.parse(review)).toMatchObject({
      unresolvedFindingIds: ['finding-1'],
    });
    expect(() =>
      ReviewResultSchema.parse({
        ...review,
        unresolvedFindingIds: ['missing-finding'],
      }),
    ).toThrow('must reference an open finding');
  });

  it('rejects unresolved references to non-open findings', () => {
    const review = {
      schemaVersion: 1,
      summary: 'Review found an issue.',
      findings: [
        {
          id: 'finding-1',
          severity: 'P1',
          title: 'Missing guard',
          description: 'A path guard is missing.',
          status: 'resolved',
        },
      ],
      requirementCoverage: [
        {
          requirementId: 'workflow-runs:specialists',
          criterion: 'Findings include severity.',
          status: 'covered',
          evidence: ['review test'],
        },
      ],
      unresolvedFindingIds: ['finding-1'],
    };

    expect(() => ReviewResultSchema.parse(review)).toThrow('must reference an open finding');
  });

  it('requires every open finding to be listed as unresolved', () => {
    const review = {
      schemaVersion: 1,
      summary: 'Review found an issue.',
      findings: [
        {
          id: 'finding-1',
          severity: 'P1',
          title: 'Missing guard',
          description: 'A path guard is missing.',
          status: 'open',
        },
      ],
      requirementCoverage: [
        {
          requirementId: 'workflow-runs:specialists',
          criterion: 'Findings include severity.',
          status: 'partial',
          evidence: ['review test'],
        },
      ],
      unresolvedFindingIds: [],
    };

    expect(() => ReviewResultSchema.parse(review)).toThrow('must be listed as unresolved');
  });
});
