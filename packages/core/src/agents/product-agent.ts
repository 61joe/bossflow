import { AgentBase } from './agent-base.js';
import {
  PRODUCT_AGENT_DESCRIPTION,
  PRODUCT_AGENT_INSTRUCTIONS,
  PRODUCT_AGENT_JSON_INSTRUCTIONS,
  PRODUCT_AGENT_NAME,
} from './constant.js';
import { DevelopmentSpecificationSchema } from './schema.js';
import type { DevelopmentSpecification, GenerateSpecificationOptions } from './types.js';

export class ProductAgent extends AgentBase<string, DevelopmentSpecification> {
  readonly role = 'product' as const;
  readonly name = PRODUCT_AGENT_NAME;
  readonly description = PRODUCT_AGENT_DESCRIPTION;
  readonly outputSchema = DevelopmentSpecificationSchema;
  protected readonly nativeInstructions = PRODUCT_AGENT_INSTRUCTIONS;
  protected readonly jsonInstructions = PRODUCT_AGENT_JSON_INSTRUCTIONS;

  protected override buildRequest(goal: string): string {
    return goal.trim();
  }

  protected override validateInput(goal: string): void {
    if (goal.trim().length === 0) {
      throw new Error('Specification goal must not be empty.');
    }
  }
}

export async function generateSpecification(
  goal: string,
  options: GenerateSpecificationOptions = {},
): Promise<DevelopmentSpecification> {
  return new ProductAgent(options).execute(goal);
}
