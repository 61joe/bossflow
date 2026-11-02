import { ZodError } from 'zod';
import type { z } from 'zod';

import {
  DEFAULT_STRUCTURED_OUTPUT_RETRIES,
  MAX_STRUCTURED_OUTPUT_RETRIES,
  VALIDATION_FEEDBACK_PREFIX,
} from './constant.js';
import { createAgentRunner } from './runner-factory.js';
import { parseStructuredOutput } from './structured-output.js';
import type { StructuredAgent, StructuredAgentExecutorOptions } from './types.js';

export class StructuredAgentExecutor {
  readonly #runner: ReturnType<typeof createAgentRunner>;
  readonly #maxValidationRetries: number;

  constructor(options: StructuredAgentExecutorOptions = {}) {
    this.#runner = createAgentRunner(options.modelRuntime);
    this.#maxValidationRetries = this.#resolveMaxValidationRetries(options.maxValidationRetries);
  }

  async execute<T>(agent: StructuredAgent, request: string, schema: z.ZodType<T>): Promise<T> {
    return this.#executeAttempt(agent, request, schema, request, 0);
  }

  async #executeAttempt<T>(
    agent: StructuredAgent,
    request: string,
    schema: z.ZodType<T>,
    originalRequest: string,
    attempt: number,
  ): Promise<T> {
    const result = await this.#runner.run(agent, request);
    try {
      return parseStructuredOutput(result.finalOutput, schema);
    } catch (error: unknown) {
      if (attempt === this.#maxValidationRetries) {
        throw error;
      }
      const feedbackRequest = `${originalRequest}\n\n${VALIDATION_FEEDBACK_PREFIX}\n${this.#formatValidationError(error)}`;
      return this.#executeAttempt(agent, feedbackRequest, schema, originalRequest, attempt + 1);
    }
  }

  #resolveMaxValidationRetries(value: number | undefined): number {
    const retries = value ?? DEFAULT_STRUCTURED_OUTPUT_RETRIES;
    if (!Number.isInteger(retries) || retries < 0 || retries > MAX_STRUCTURED_OUTPUT_RETRIES) {
      throw new Error(
        `maxValidationRetries must be an integer between 0 and ${MAX_STRUCTURED_OUTPUT_RETRIES}.`,
      );
    }
    return retries;
  }

  #formatValidationError(error: unknown): string {
    if (error instanceof ZodError) {
      return error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n')
        .slice(0, 2_000);
    }
    if (error instanceof SyntaxError) {
      return `Invalid JSON: ${error.message}`.slice(0, 2_000);
    }
    return 'The response could not be parsed as the required structured output.';
  }
}
