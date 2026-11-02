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
const { StructuredAgentExecutor } = await import('../index.js');

const ValueSchema = z.object({ value: z.number() }).strict();

describe('StructuredAgentExecutor', () => {
  beforeEach(() => {
    runtimeMock.resetAgentRuntimeMock();
  });

  it('retries malformed JSON and nested schema failures with feedback', async () => {
    runtimeMock.queueOutputs('not-json', '{"value":"wrong"}', '{"value":1}');
    const agent = new runtimeMock.MockAgent({ name: 'test' });
    const executor = new StructuredAgentExecutor();

    await expect(executor.execute(agent as never, 'Create output', ValueSchema)).resolves.toEqual({
      value: 1,
    });

    expect(runtimeMock.runCalls).toHaveLength(3);
    expect(runtimeMock.runCalls[1]?.input).toContain('Invalid JSON');
    expect(runtimeMock.runCalls[2]?.input).toContain('value:');
  });

  it('formats root validation issues and stops at the retry limit', async () => {
    runtimeMock.queueOutputs('{}', 'still wrong');
    const agent = new runtimeMock.MockAgent({ name: 'test' });
    const executor = new StructuredAgentExecutor({ maxValidationRetries: 1 });

    await expect(
      executor.execute(agent as never, 'Create output', z.string()),
    ).rejects.toBeInstanceOf(SyntaxError);
    expect(runtimeMock.runCalls[1]?.input).toContain('(root):');
  });

  it('formats non-JSON validation errors', async () => {
    runtimeMock.queueOutputs('{"value":1}', '{"value":2}');
    const schema = {
      parse: () => {
        throw new Error('custom validation');
      },
    } as unknown as z.ZodType<unknown>;
    const executor = new StructuredAgentExecutor({ maxValidationRetries: 1 });

    await expect(
      executor.execute(
        new runtimeMock.MockAgent({ name: 'test' }) as never,
        'Create output',
        schema,
      ),
    ).rejects.toThrow('custom validation');
    expect(runtimeMock.runCalls).toHaveLength(2);
    expect(runtimeMock.runCalls[1]?.input).toContain('could not be parsed');
  });

  it.each([-1, 1.5, 6])('rejects invalid retry count %s', (maxValidationRetries) => {
    expect(() => new StructuredAgentExecutor({ maxValidationRetries })).toThrow('between 0 and 5');
  });
});
