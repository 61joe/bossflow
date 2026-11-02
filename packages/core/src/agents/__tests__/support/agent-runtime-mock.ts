import { jest } from '@jest/globals';

export const agentConfigs: Record<string, unknown>[] = [];
export const runnerConfigs: Record<string, unknown>[] = [];
export const asToolCalls: Record<string, unknown>[] = [];
export const runCalls: Array<{ readonly agent: unknown; readonly input: string }> = [];
export const queuedOutputs: unknown[] = [];
let agentConstructionFailure: string | undefined;

export class MockAgent {
  constructor(config: Record<string, unknown>) {
    if (
      agentConstructionFailure !== undefined &&
      typeof config.name === 'string' &&
      config.name.includes(agentConstructionFailure)
    ) {
      agentConstructionFailure = undefined;
      throw new Error(`Unable to construct ${config.name}.`);
    }
    agentConfigs.push(config);
  }

  asTool(options: Record<string, unknown>): Record<string, unknown> {
    asToolCalls.push(options);
    return {
      type: 'function',
      name: options.toolName,
      description: options.toolDescription,
      invoke: jest.fn(),
    };
  }
}

export class MockRunner {
  constructor(config: Record<string, unknown>) {
    runnerConfigs.push(config);
  }

  async run(agent: unknown, input: string): Promise<{ finalOutput: unknown }> {
    runCalls.push({ agent, input });
    if (queuedOutputs.length === 0) {
      throw new Error('No mock agent output queued.');
    }
    return { finalOutput: queuedOutputs.shift() };
  }
}

export function queueOutputs(...outputs: unknown[]): void {
  queuedOutputs.push(...outputs);
}

export function failAgentConstructionFor(nameFragment: string): void {
  agentConstructionFailure = nameFragment;
}

export function resetAgentRuntimeMock(): void {
  agentConfigs.length = 0;
  runnerConfigs.length = 0;
  asToolCalls.length = 0;
  runCalls.length = 0;
  queuedOutputs.length = 0;
  agentConstructionFailure = undefined;
}
