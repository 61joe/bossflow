import { jest } from '@jest/globals';

export const passwordMock = jest.fn<() => Promise<string>>();
export const agentConfigs: Record<string, unknown>[] = [];
export const runnerConfigs: Record<string, unknown>[] = [];

let nextOutput: unknown;

export function setAgentOutput(output: unknown): void {
  nextOutput = output;
}

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

class MockOpenAIProvider {
  constructor(readonly config: Record<string, unknown>) {}

  getModel(): never {
    throw new Error('not used');
  }
}

jest.unstable_mockModule(
  '@openai/agents',
  () => ({
    Agent: MockAgent,
    OpenAIProvider: MockOpenAIProvider,
    Runner: MockRunner,
  }),
  { virtual: true },
);

jest.unstable_mockModule('@inquirer/prompts', () => ({
  password: passwordMock,
}));

export const { main } = await import('../index.js');
