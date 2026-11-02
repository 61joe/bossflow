import { TechnicalPlanSchema } from '../contracts/index.js';
import type { TechnicalPlan } from '../contracts/index.js';
import { AgentBase } from './agent-base.js';
import {
  TECH_LEAD_AGENT_DESCRIPTION,
  TECH_LEAD_AGENT_INSTRUCTIONS,
  TECH_LEAD_AGENT_JSON_INSTRUCTIONS,
  TECH_LEAD_AGENT_NAME,
} from './constant.js';
import type { GenerateTechnicalPlanOptions, TechnicalPlanAgentInput } from './types.js';

export class TechLeadAgent extends AgentBase<TechnicalPlanAgentInput, TechnicalPlan> {
  readonly role = 'tech-lead' as const;
  readonly name = TECH_LEAD_AGENT_NAME;
  readonly description = TECH_LEAD_AGENT_DESCRIPTION;
  readonly outputSchema = TechnicalPlanSchema;
  protected readonly nativeInstructions = TECH_LEAD_AGENT_INSTRUCTIONS;
  protected readonly jsonInstructions = TECH_LEAD_AGENT_JSON_INSTRUCTIONS;

  protected override buildRequest(input: TechnicalPlanAgentInput): string {
    return `Create the technical plan for this workflow input:\n${JSON.stringify(input)}`;
  }

  protected override validateInput(input: TechnicalPlanAgentInput): void {
    if (input.repositoryContext.trim().length === 0) {
      throw new Error('Technical plan repository context must not be empty.');
    }
  }
}

export async function generateTechnicalPlan(
  input: TechnicalPlanAgentInput,
  options: GenerateTechnicalPlanOptions = {},
): Promise<TechnicalPlan> {
  return new TechLeadAgent(options).execute(input);
}
