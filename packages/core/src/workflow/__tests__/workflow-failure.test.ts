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

describe('workflow failure state', () => {
  it('clears terminal failure after a successful recovery transition', () => {
    const failedRun: WorkflowRun = {
      ...baseRun,
      stage: 'failed',
      failure: {
        stage: 'build',
        code: 'BUILD_FAILED',
        message: 'Build failed',
        occurredAt: '2026-11-02T00:00:00.000Z',
        retryable: true,
      },
    };
    const result = transitionWorkflow(failedRun, 'spec', '2026-11-02T00:01:00.000Z');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run.failure).toBeUndefined();
    }
  });

  it('requires failure metadata when entering the failed stage', () => {
    expect(transitionWorkflow(baseRun, 'failed', '2026-11-02T00:01:00.000Z')).toMatchObject({
      ok: false,
      from: 'spec',
      to: 'failed',
    });
  });
});
