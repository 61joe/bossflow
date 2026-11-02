import { jest } from '@jest/globals';
import { z } from 'zod';

jest.unstable_mockModule('@openai/agents', async () => {
  const mock = await import('./support/agent-runtime-mock.js');
  return {
    Agent: mock.MockAgent,
    Runner: mock.MockRunner,
  };
});

const runtimeMock = await import('./support/agent-runtime-mock.js');
const {
  AgentExecutionStrategyFactory,
  AgentRegistry,
  SingleAgentExecutionStrategy,
  SpecialistAgentExecutionStrategy,
} = await import('../index.js');

const ValueSchema = z.object({ value: z.string() }).strict();
const prepared = {
  role: 'product' as const,
  request: 'Create a value.',
  schema: ValueSchema,
  singleAgentInstructions: 'Return JSON.',
};

describe('agent execution strategies', () => {
  beforeEach(() => {
    runtimeMock.resetAgentRuntimeMock();
  });

  it('constructs a specialist strategy with default options', async () => {
    const strategy = new SpecialistAgentExecutionStrategy(new AgentRegistry());
    runtimeMock.queueOutputs({ value: 'specialist' });

    expect(strategy.mode).toBe('specialists');
    await expect(strategy.execute(prepared)).resolves.toEqual({ value: 'specialist' });
  });

  it('constructs a single-agent strategy with default options', async () => {
    const strategy = new SingleAgentExecutionStrategy();
    runtimeMock.queueOutputs({ value: 'single' });

    expect(strategy.mode).toBe('single-agent');
    await expect(strategy.execute(prepared)).resolves.toEqual({ value: 'single' });
    expect(runtimeMock.runCalls[0]?.input).toContain('Return JSON.');
  });

  it('selects specialists with default factory options', () => {
    const strategy = new AgentExecutionStrategyFactory().create(new AgentRegistry());

    expect(strategy.mode).toBe('specialists');
  });

  it('falls back when asTool initialization fails', () => {
    const registry = new AgentRegistry();
    Object.defineProperty(registry.product, 'asTool', {
      value: () => {
        throw new Error('unsupported asTool');
      },
    });

    const strategy = new AgentExecutionStrategyFactory().create(registry);

    expect(strategy.mode).toBe('single-agent');
  });

  it('falls back when stage manager construction fails', () => {
    const registry = new AgentRegistry();
    runtimeMock.failAgentConstructionFor('BossFlowProductOrchestrator');

    const strategy = new AgentExecutionStrategyFactory().create(registry);

    expect(strategy.mode).toBe('single-agent');
  });

  it('does not hide unexpected specialist construction errors', () => {
    const registry = {
      supportsAgentTools: () => true,
      get product() {
        throw new Error('registry bug');
      },
    } as unknown as InstanceType<typeof AgentRegistry>;

    expect(() => new AgentExecutionStrategyFactory().create(registry)).toThrow('registry bug');
  });
});
