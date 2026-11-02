import { Agent } from '@openai/agents';
import type { z } from 'zod';

import type { ModelRuntime } from '../models/index.js';
import type { StructuredAgent } from './types.js';

interface CreateStructuredAgentOptions<T> {
  readonly name: string;
  readonly instructions: string;
  readonly jsonInstructions: string;
  readonly schema: z.ZodType<T>;
  readonly runtime?: ModelRuntime;
}

export function createStructuredAgent<T>(
  options: CreateStructuredAgentOptions<T>,
): StructuredAgent {
  const agent = new Agent({
    name: options.name,
    instructions:
      options.runtime?.structuredOutputMode === 'prompt-json'
        ? options.jsonInstructions
        : options.instructions,
    ...(options.runtime?.structuredOutputMode === 'prompt-json'
      ? {}
      : { outputType: options.schema }),
  });
  // SDK agent output generics are invariant although the schema is fixed during construction.
  return agent as unknown as StructuredAgent;
}

export function createTextAgent(name: string, instructions: string): StructuredAgent {
  return new Agent({
    name,
    instructions,
  });
}
