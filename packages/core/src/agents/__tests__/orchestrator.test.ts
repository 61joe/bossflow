import { jest } from '@jest/globals';

import {
  IMPLEMENTATION_INPUT,
  IMPLEMENTATION_RESULT,
  REVIEWER_INPUT,
  SPECIFICATION,
  TECHNICAL_PLAN,
  TECHNICAL_PLAN_INPUT,
} from './support/agent-fixtures.js';
import type { ReviewResult } from '../../contracts/index.js';

jest.unstable_mockModule('@openai/agents', async () => {
  const mock = await import('./support/agent-runtime-mock.js');
  return {
    Agent: mock.MockAgent,
    Runner: mock.MockRunner,
  };
});

const runtimeMock = await import('./support/agent-runtime-mock.js');
const { createWorkflowAgentOrchestrator, WorkflowAgentOrchestrator } = await import('../index.js');

const reviewResult: ReviewResult = {
  schemaVersion: 1,
  summary: 'No blocking findings.',
  findings: [],
  requirementCoverage: [
    {
      requirementId: 'workflow-runs:specialists',
      criterion: 'Specialist outputs are validated.',
      status: 'covered',
      evidence: ['orchestrator test'],
    },
  ],
  unresolvedFindingIds: [],
};

describe('workflow agent orchestrator', () => {
  beforeEach(() => {
    runtimeMock.resetAgentRuntimeMock();
  });

  it('runs every specialist through agent.asTool while retaining stage control', async () => {
    runtimeMock.queueOutputs(SPECIFICATION, TECHNICAL_PLAN, IMPLEMENTATION_RESULT, reviewResult);
    const orchestrator = new WorkflowAgentOrchestrator();

    expect(orchestrator.executionMode).toBe('specialists');
    await expect(orchestrator.generateSpecification(' Add specialist agents ')).resolves.toEqual(
      SPECIFICATION,
    );
    await expect(orchestrator.generateTechnicalPlan(TECHNICAL_PLAN_INPUT)).resolves.toEqual(
      TECHNICAL_PLAN,
    );
    await expect(orchestrator.generateImplementationResult(IMPLEMENTATION_INPUT)).resolves.toEqual(
      IMPLEMENTATION_RESULT,
    );
    await expect(orchestrator.generateReviewResult(REVIEWER_INPUT)).resolves.toEqual(reviewResult);

    expect(runtimeMock.asToolCalls.map((call) => call.toolName)).toEqual([
      'run_product_specialist',
      'run_tech_lead_specialist',
      'run_implementer_specialist',
      'run_reviewer_specialist',
    ]);
    expect(runtimeMock.runCalls).toHaveLength(4);
    expect(runtimeMock.runCalls[0]?.input).toBe('Add specialist agents');
  });

  it('uses one agent when specialist capability detection is false', async () => {
    runtimeMock.queueOutputs(SPECIFICATION, TECHNICAL_PLAN, IMPLEMENTATION_RESULT, reviewResult);
    const orchestrator = new WorkflowAgentOrchestrator({
      capabilityDetector: () => false,
    });

    expect(orchestrator.executionMode).toBe('single-agent');
    await orchestrator.generateSpecification('Add specialist agents');
    await orchestrator.generateTechnicalPlan(TECHNICAL_PLAN_INPUT);
    await orchestrator.generateImplementationResult(IMPLEMENTATION_INPUT);
    await orchestrator.generateReviewResult(REVIEWER_INPUT);

    expect(runtimeMock.asToolCalls).toHaveLength(0);
    expect(runtimeMock.agentConfigs.at(-1)).toMatchObject({ name: 'BossFlowSingleAgent' });
    expect(runtimeMock.runCalls[0]?.input).toContain('Workflow input:');
    expect(runtimeMock.runCalls[1]?.input).toContain('technical lead agent');
    expect(runtimeMock.runCalls[2]?.input).toContain('implementer agent');
    expect(runtimeMock.runCalls[3]?.input).toContain('reviewer agent');
  });

  it('does not hide unexpected capability detector errors', () => {
    expect(
      () =>
        new WorkflowAgentOrchestrator({
          capabilityDetector: () => {
            throw new Error('detector bug');
          },
        }),
    ).toThrow('detector bug');
  });

  it('rejects an empty specification goal', async () => {
    const orchestrator = new WorkflowAgentOrchestrator();

    await expect(orchestrator.generateSpecification('   ')).rejects.toThrow('must not be empty');
    expect(runtimeMock.runCalls).toHaveLength(0);
  });

  it('provides a class-compatible factory function', () => {
    const orchestrator = createWorkflowAgentOrchestrator();

    expect(orchestrator).toBeInstanceOf(WorkflowAgentOrchestrator);
    expect(orchestrator.executionMode).toBe('specialists');
  });
});
