import { jest } from '@jest/globals';

import { createRuntime, TECHNICAL_PLAN, TECHNICAL_PLAN_INPUT } from './support/agent-fixtures.js';

jest.unstable_mockModule('@openai/agents', async () => {
  const mock = await import('./support/agent-runtime-mock.js');
  return {
    Agent: mock.MockAgent,
    Runner: mock.MockRunner,
  };
});

const runtimeMock = await import('./support/agent-runtime-mock.js');
const { generateTechnicalPlan } = await import('../index.js');

describe('generateTechnicalPlan', () => {
  beforeEach(() => {
    runtimeMock.resetAgentRuntimeMock();
  });

  it('generates a native structured technical plan', async () => {
    runtimeMock.queueOutputs(TECHNICAL_PLAN);

    await expect(generateTechnicalPlan(TECHNICAL_PLAN_INPUT)).resolves.toEqual(TECHNICAL_PLAN);

    expect(runtimeMock.agentConfigs[0]).toHaveProperty('outputType');
    expect(runtimeMock.runCalls[0]?.input).toContain('TypeScript pnpm workspace.');
  });

  it('parses fenced JSON from a compatible provider', async () => {
    runtimeMock.queueOutputs(`\`\`\`json\n${JSON.stringify(TECHNICAL_PLAN)}\n\`\`\``);

    await expect(
      generateTechnicalPlan(TECHNICAL_PLAN_INPUT, {
        modelRuntime: createRuntime('prompt-json'),
      }),
    ).resolves.toEqual(TECHNICAL_PLAN);
    expect(runtimeMock.agentConfigs[0]).not.toHaveProperty('outputType');
    expect(runtimeMock.runnerConfigs[0]).toMatchObject({ model: 'compatible-model' });
  });

  it('requires repository context', async () => {
    await expect(
      generateTechnicalPlan({
        ...TECHNICAL_PLAN_INPUT,
        repositoryContext: '   ',
      }),
    ).rejects.toThrow('must not be empty');
    expect(runtimeMock.runCalls).toHaveLength(0);
  });
});
