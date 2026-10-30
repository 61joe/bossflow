import { canTransition, transitionWorkflow } from '../index.js';
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
});
