import type { Tool, UnknownContext } from '@openai/agents';
import type { z } from 'zod';

import { createStructuredAgent } from './agent-factory.js';
import { SPECIALIST_TOOL_NAMES } from './constant.js';
import { StructuredAgentExecutor } from './structured-agent-executor.js';
import type { AgentExecutionStrategy } from './agent-execution-strategy.js';
import type {
  AgentBaseOptions,
  PreparedAgentExecution,
  SpecialistRole,
  StructuredAgent,
} from './types.js';
import type { ModelRuntime } from '../models/index.js';

export abstract class AgentBase<TInput, TOutput> {
  abstract readonly role: SpecialistRole;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly outputSchema: z.ZodType<TOutput>;
  protected abstract readonly nativeInstructions: string;
  protected abstract readonly jsonInstructions: string;

  readonly #executorOptions: AgentBaseOptions;
  #executor: StructuredAgentExecutor | undefined;
  readonly #modelRuntime: ModelRuntime | undefined;
  #sdkAgent: StructuredAgent | undefined;

  constructor(options: AgentBaseOptions = {}) {
    this.#executorOptions = options;
    this.#modelRuntime = options.modelRuntime;
  }

  async execute(input: TInput): Promise<TOutput> {
    const prepared = this.#prepare(input);
    const result = await this.#getExecutor().execute(
      this.#getSdkAgent(),
      prepared.request,
      prepared.schema,
    );
    return this.#finalize(result, input);
  }

  async executeWith(input: TInput, strategy: AgentExecutionStrategy): Promise<TOutput> {
    const prepared = this.#prepare(input);
    const result = await strategy.execute(prepared);
    return this.#finalize(result, input);
  }

  asTool(): Tool<UnknownContext> {
    return this.#getSdkAgent().asTool({
      toolName: SPECIALIST_TOOL_NAMES[this.role],
      toolDescription: this.description,
      needsApproval: false,
    });
  }

  protected abstract buildRequest(input: TInput): string;

  protected validateInput(_input: TInput): void {}

  protected validateOutput(_output: TOutput, _input: TInput): void {}

  #prepare(input: TInput): PreparedAgentExecution<TOutput> {
    this.validateInput(input);
    return {
      role: this.role,
      request: this.buildRequest(input),
      schema: this.outputSchema,
      singleAgentInstructions: this.jsonInstructions,
    };
  }

  #finalize(result: TOutput, input: TInput): TOutput {
    const parsed = this.outputSchema.parse(result);
    this.validateOutput(parsed, input);
    return parsed;
  }

  #getSdkAgent(): StructuredAgent {
    if (this.#sdkAgent === undefined) {
      this.#sdkAgent = createStructuredAgent({
        name: this.name,
        instructions: this.nativeInstructions,
        jsonInstructions: this.jsonInstructions,
        schema: this.outputSchema,
        ...(this.#modelRuntime === undefined ? {} : { runtime: this.#modelRuntime }),
      });
    }
    return this.#sdkAgent;
  }

  #getExecutor(): StructuredAgentExecutor {
    if (this.#executor === undefined) {
      this.#executor = new StructuredAgentExecutor(this.#executorOptions);
    }
    return this.#executor;
  }
}
