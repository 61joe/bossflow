import { canTransition, prepareRetryWorkflow, transitionWorkflow } from '../index.js';
import type { WorkflowRun } from '../index.js';

const baseRun: WorkflowRun = {
  schemaVersion: 1,
  id: 'run-1',
  repositoryPath: '/tmp/project',
  goal: 'Add export support',
  modelProfile: 'openai',
  stage: 'spec',
  attempt: 1,
  artifacts: [],
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
};

describe('workflow transitions', () => {
  it('allows the normal specification to planning transition', () => {
    expect(canTransition('spec', 'plan')).toBe(true);
  });

  it('returns an immutable updated run when the transition is allowed', () => {
    const result = transitionWorkflow(baseRun, 'plan', '2026-10-30T00:01:00.000Z');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.stage).toBe('plan');
      expect(result.run.updatedAt).toBe('2026-10-30T00:01:00.000Z');
    }
    expect(baseRun.stage).toBe('spec');
  });

  it('rejects an invalid backward transition', () => {
    const result = transitionWorkflow(baseRun, 'build', '2026-10-30T00:01:00.000Z');

    expect(result).toMatchObject({
      ok: false,
      from: 'spec',
      to: 'build',
    });
  });

  it('rejects a generic terminal-to-Verify transition and requires the retry path', () => {
    const blockedRun = {
      ...baseRun,
      stage: 'blocked' as const,
    };
    expect(canTransition('blocked', 'verify')).toBe(false);
    expect(canTransition('failed', 'verify')).toBe(false);
    expect(transitionWorkflow(blockedRun, 'verify', '2026-10-30T00:01:00.000Z')).toMatchObject({
      ok: false,
      from: 'blocked',
      to: 'verify',
    });
    expect(prepareRetryWorkflow(blockedRun, 'verify', '2026-10-30T00:01:00.000Z')).toMatchObject({
      stage: 'verify',
      workflowRevision: 2,
    });
    expect(() =>
      prepareRetryWorkflow({ ...blockedRun, stage: 'build' }, 'verify', '2026-10-30T00:01:00.000Z'),
    ).toThrow('requires a blocked or failed stage');
  });

  it('treats a repeated transition to the current stage as idempotent', () => {
    const result = transitionWorkflow(baseRun, 'spec', '2026-11-02T00:02:00.000Z');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run).toBe(baseRun);
    }
  });

  it('backfills omitted transition arrays before retry or normal advancement', () => {
    const legacyRun: WorkflowRun = {
      ...baseRun,
      workflowRevision: undefined,
      approvals: undefined,
      artifacts: undefined,
    };
    expect(transitionWorkflow(legacyRun, 'plan', '2026-10-30T00:01:00.000Z')).toMatchObject({
      ok: true,
      run: { approvals: [], artifacts: [], workflowRevision: 2 },
    });
    expect(
      prepareRetryWorkflow(
        { ...legacyRun, stage: 'blocked' },
        'verify',
        '2026-10-30T00:02:00.000Z',
      ),
    ).toMatchObject({
      approvals: [],
      artifacts: [],
      workflowRevision: 2,
    });
  });
});
