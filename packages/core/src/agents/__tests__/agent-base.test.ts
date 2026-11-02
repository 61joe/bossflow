import { jest } from '@jest/globals';
import { z } from 'zod';

import type { SpecialistRole } from '../index.js';

jest.unstable_mockModule('@openai/agents', async () => {
  const mock = await import('./support/agent-runtime-mock.js');
  return {
    Agent: mock.MockAgent,
    Runner: mock.MockRunner,
  };
});

const runtimeMock = await import('./support/agent-runtime-mock.js');
const { AgentBase } = await import('../index.js');

const OutputSchema = z.object({ value: z.string() }).strict();
type Output = z.infer<typeof OutputSchema>;

class FakeAgent extends AgentBase<string, Output> {
  readonly role: SpecialistRole = 'product';
  readonly name = 'FakeAgent';
  readonly description = 'Fake agent for base behavior.';
  readonly outputSchema = OutputSchema;
  protected readonly nativeInstructions = 'Return a value.';
  protected readonly jsonInstructions = 'Return JSON with a value.';

  protected override buildRequest(input: string): string {
    return `Request: ${input}`;
  }
}

describe('AgentBase', () => {
  beforeEach(() => {
    runtimeMock.resetAgentRuntimeMock();
  });

  it('executes through the shared structured executor and caches the SDK agent', async () => {
    runtimeMock.queueOutputs({ value: 'ok' }, { value: 'again' });
    const agent = new FakeAgent();

    await expect(agent.execute('test')).resolves.toEqual({ value: 'ok' });
    await expect(agent.execute('test')).resolves.toEqual({ value: 'again' });
    expect(agent.asTool()).toMatchObject({ name: 'run_product_specialist' });

    expect(runtimeMock.agentConfigs).toHaveLength(1);
    expect(runtimeMock.runnerConfigs).toHaveLength(1);
    expect(runtimeMock.runCalls[0]?.input).toBe('Request: test');
  });

  it('lazy-loads the structured executor until direct execution', () => {
    const agent = new FakeAgent();

    expect(runtimeMock.runnerConfigs).toHaveLength(0);
    void agent.asTool();
    expect(runtimeMock.runnerConfigs).toHaveLength(0);
  });
});
