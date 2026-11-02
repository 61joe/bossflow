import { jest } from '@jest/globals';

jest.unstable_mockModule('@openai/agents', async () => {
  const mock = await import('./support/agent-runtime-mock.js');
  return {
    Agent: mock.MockAgent,
    Runner: mock.MockRunner,
  };
});

const runtimeMock = await import('./support/agent-runtime-mock.js');
const { AgentRegistry, ImplementerAgent, ProductAgent, ReviewerAgent, TechLeadAgent } =
  await import('../index.js');

describe('AgentRegistry', () => {
  it('constructs all role classes and reports tool support', () => {
    const registry = new AgentRegistry();

    expect(registry.product).toBeInstanceOf(ProductAgent);
    expect(registry.techLead).toBeInstanceOf(TechLeadAgent);
    expect(registry.implementer).toBeInstanceOf(ImplementerAgent);
    expect(registry.reviewer).toBeInstanceOf(ReviewerAgent);
    expect(registry.supportsAgentTools()).toBe(true);
    expect(runtimeMock.runnerConfigs).toHaveLength(0);
  });

  it('reports missing tool support', () => {
    const registry = new AgentRegistry();
    Object.defineProperty(registry.reviewer, 'asTool', {
      value: undefined,
    });

    expect(registry.supportsAgentTools()).toBe(false);
  });
});
