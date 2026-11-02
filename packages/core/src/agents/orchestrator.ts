import type { ImplementationResult, ReviewResult, TechnicalPlan } from '../contracts/index.js';
import { AgentExecutionStrategyFactory } from './agent-execution-strategy.js';
import type { AgentExecutionStrategy } from './agent-execution-strategy.js';
import { AgentRegistry } from './agent-registry.js';
import type {
  AgentOrchestratorExecutionMode,
  DevelopmentSpecification,
  ImplementationAgentInput,
  ReviewerAgentInput,
  TechnicalPlanAgentInput,
  WorkflowAgentOrchestratorOptions,
} from './types.js';

export class WorkflowAgentOrchestrator {
  readonly executionMode: AgentOrchestratorExecutionMode;
  readonly #agents: AgentRegistry;
  readonly #strategy: AgentExecutionStrategy;

  constructor(options: WorkflowAgentOrchestratorOptions = {}) {
    this.#agents = new AgentRegistry(options);
    this.#strategy = new AgentExecutionStrategyFactory().create(this.#agents, options);
    this.executionMode = this.#strategy.mode;
  }

  generateSpecification(goal: string): Promise<DevelopmentSpecification> {
    return this.#agents.product.executeWith(goal, this.#strategy);
  }

  generateTechnicalPlan(input: TechnicalPlanAgentInput): Promise<TechnicalPlan> {
    return this.#agents.techLead.executeWith(input, this.#strategy);
  }

  generateImplementationResult(input: ImplementationAgentInput): Promise<ImplementationResult> {
    return this.#agents.implementer.executeWith(input, this.#strategy);
  }

  generateReviewResult(input: ReviewerAgentInput): Promise<ReviewResult> {
    return this.#agents.reviewer.executeWith(input, this.#strategy);
  }
}

export function createWorkflowAgentOrchestrator(
  options: WorkflowAgentOrchestratorOptions = {},
): WorkflowAgentOrchestrator {
  return new WorkflowAgentOrchestrator(options);
}
