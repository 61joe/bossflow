import { jest } from '@jest/globals';

import type { ModelRuntime } from '../../models/index.js';

const agentConfigs: Record<string, unknown>[] = [];
const runnerConfigs: Record<string, unknown>[] = [];
let nextOutput: unknown;

class MockAgent {
  constructor(config: Record<string, unknown>) {
    agentConfigs.push(config);
  }
}

class MockRunner {
  constructor(config: Record<string, unknown>) {
    runnerConfigs.push(config);
  }

  async run(): Promise<{ finalOutput: unknown }> {
    return { finalOutput: nextOutput };
  }
}

jest.unstable_mockModule('@openai/agents', () => ({
  Agent: MockAgent,
  Runner: MockRunner,
}));

const { generateSpecification, probeModelRuntime } = await import('../index.js');
const { createAgentRunner } = await import('../runner-factory.js');
const { parseStructuredOutput } = await import('../structured-output.js');

const specification = {
  title: 'Export',
  problem: 'No export',
  scope: ['Add export'],
  nonGoals: [],
  acceptanceCriteria: ['File downloads'],
  constraints: [],
};

describe('agent runtime integration', () => {
  beforeEach(() => {
    agentConfigs.length = 0;
    runnerConfigs.length = 0;
    nextOutput = undefined;
  });

  it('generates native and prompt-directed specifications', async () => {
    nextOutput = specification;
    await expect(generateSpecification('  Add export  ')).resolves.toEqual(specification);
    expect(agentConfigs[0]).toHaveProperty('outputType');
    expect(runnerConfigs[0]).toEqual({ tracingDisabled: true });

    nextOutput = `\`\`\`json\n${JSON.stringify(specification)}\n\`\`\``;
    await expect(
      generateSpecification('Add export', {
        modelRuntime: {
          provider: createProvider(),
          model: 'compatible-model',
          structuredOutputMode: 'prompt-json',
        },
      }),
    ).resolves.toEqual(specification);
    expect(agentConfigs[1]).not.toHaveProperty('outputType');
    expect(runnerConfigs[1]).toMatchObject({ model: 'compatible-model' });
  });

  it('rejects an empty specification goal', async () => {
    await expect(generateSpecification('   ')).rejects.toThrow('must not be empty');
  });

  it('runs model probes in both provider modes', async () => {
    nextOutput = { status: 'ok', message: 'native' };
    await expect(
      probeModelRuntime({
        provider: createProvider(),
        structuredOutputMode: 'native',
      }),
    ).resolves.toEqual({ status: 'ok', message: 'native' });

    nextOutput = JSON.stringify({ status: 'ok', message: 'compatible' });
    await expect(
      probeModelRuntime({
        provider: createProvider(),
        model: 'compatible-model',
        structuredOutputMode: 'prompt-json',
      }),
    ).resolves.toEqual({ status: 'ok', message: 'compatible' });
  });

  it('creates runners with omitted and explicit model options', () => {
    createAgentRunner();
    createAgentRunner({
      provider: createProvider(),
      structuredOutputMode: 'native',
    });
    createAgentRunner({
      provider: createProvider(),
      model: 'explicit-model',
      structuredOutputMode: 'native',
    });

    expect(runnerConfigs[0]).toEqual({ tracingDisabled: true });
    expect(runnerConfigs[1]).toEqual({
      tracingDisabled: true,
      modelProvider: expect.any(Object),
    });
    expect(runnerConfigs[2]).toMatchObject({ model: 'explicit-model' });
  });

  it('parses plain and fenced structured output', () => {
    expect(parseStructuredOutput(JSON.stringify({ value: 1 }), jsonSchema())).toEqual({ value: 1 });
    expect(parseStructuredOutput('```json\n{"value":2}\n```', jsonSchema())).toEqual({ value: 2 });
  });
});

function jsonSchema() {
  return {
    parse: (value: unknown) => {
      if (
        typeof value !== 'object' ||
        value === null ||
        !('value' in value) ||
        typeof value.value !== 'number'
      ) {
        throw new Error('invalid');
      }
      return { value: value.value };
    },
  } as never;
}

function createProvider(): ModelRuntime['provider'] {
  return { getModel: jest.fn() } as unknown as ModelRuntime['provider'];
}
