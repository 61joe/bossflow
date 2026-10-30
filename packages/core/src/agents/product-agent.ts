import { Agent } from '@openai/agents';

import {
  PRODUCT_AGENT_INSTRUCTIONS,
  PRODUCT_AGENT_JSON_INSTRUCTIONS,
  PRODUCT_AGENT_NAME,
} from './constant.js';
import { createAgentRunner } from './runner-factory.js';
import { DevelopmentSpecificationSchema } from './schema.js';
import { parseStructuredOutput } from './structured-output.js';
import type { DevelopmentSpecification, GenerateSpecificationOptions } from './types.js';

export async function generateSpecification(
  goal: string,
  options: GenerateSpecificationOptions = {},
): Promise<DevelopmentSpecification> {
  const normalizedGoal = goal.trim();
  if (normalizedGoal.length === 0) {
    throw new Error('Specification goal must not be empty.');
  }

  const agent =
    options.modelRuntime?.structuredOutputMode === 'prompt-json'
      ? new Agent({
          name: PRODUCT_AGENT_NAME,
          instructions: PRODUCT_AGENT_JSON_INSTRUCTIONS,
        })
      : new Agent({
          name: PRODUCT_AGENT_NAME,
          instructions: PRODUCT_AGENT_INSTRUCTIONS,
          outputType: DevelopmentSpecificationSchema,
        });
  const runner = createAgentRunner(options.modelRuntime);
  const result = await runner.run(agent, normalizedGoal);
  return parseStructuredOutput(result.finalOutput, DevelopmentSpecificationSchema);
}
