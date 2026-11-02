import { Agent } from '@openai/agents';
import type { Tool, UnknownContext } from '@openai/agents';

import { createTextAgent } from './agent-factory.js';
import { SpecialistCapabilityError } from './agent-execution-error.js';
import {
  ORCHESTRATOR_INSTRUCTIONS,
  SINGLE_AGENT_INSTRUCTIONS,
  SINGLE_AGENT_NAME,
} from './constant.js';
import type { AgentRegistry } from './agent-registry.js';
import { StructuredAgentExecutor } from './structured-agent-executor.js';
import type {
  AgentOrchestratorExecutionMode,
  PreparedAgentExecution,
  SpecialistRole,
  StructuredAgent,
  WorkflowAgentOrchestratorOptions,
} from './types.js';

type Specialists = Readonly<Record<SpecialistRole, { asTool(): Tool<UnknownContext> }>>;

export abstract class AgentExecutionStrategy {
  abstract readonly mode: AgentOrchestratorExecutionMode;
  abstract execute<T>(request: PreparedAgentExecution<T>): Promise<T>;
}

export class SpecialistAgentExecutionStrategy extends AgentExecutionStrategy {
  readonly mode = 'specialists' as const;
  readonly #managers: Readonly<Record<SpecialistRole, StructuredAgent>>;
  readonly #executor: StructuredAgentExecutor;

  constructor(registry: AgentRegistry, options: WorkflowAgentOrchestratorOptions = {}) {
    super();
    const specialists: Specialists = {
      product: registry.product,
      'tech-lead': registry.techLead,
      implementer: registry.implementer,
      reviewer: registry.reviewer,
    };
    this.#managers = {
      product: createStageManager('product', createSpecialistTool('product', specialists.product)),
      'tech-lead': createStageManager(
        'tech-lead',
        createSpecialistTool('tech-lead', specialists['tech-lead']),
      ),
      implementer: createStageManager(
        'implementer',
        createSpecialistTool('implementer', specialists.implementer),
      ),
      reviewer: createStageManager(
        'reviewer',
        createSpecialistTool('reviewer', specialists.reviewer),
      ),
    };
    this.#executor = new StructuredAgentExecutor(options);
  }

  async execute<T>(request: PreparedAgentExecution<T>): Promise<T> {
    return this.#executor.execute(this.#managers[request.role], request.request, request.schema);
  }
}

export class SingleAgentExecutionStrategy extends AgentExecutionStrategy {
  readonly mode = 'single-agent' as const;
  readonly #agent: StructuredAgent;
  readonly #executor: StructuredAgentExecutor;

  constructor(options: WorkflowAgentOrchestratorOptions = {}) {
    super();
    this.#agent = createTextAgent(SINGLE_AGENT_NAME, SINGLE_AGENT_INSTRUCTIONS);
    this.#executor = new StructuredAgentExecutor(options);
  }

  async execute<T>(request: PreparedAgentExecution<T>): Promise<T> {
    return this.#executor.execute(
      this.#agent,
      `${request.singleAgentInstructions}\n\nWorkflow input:\n${request.request}`,
      request.schema,
    );
  }
}

export class AgentExecutionStrategyFactory {
  create(
    registry: AgentRegistry,
    options: WorkflowAgentOrchestratorOptions = {},
  ): AgentExecutionStrategy {
    const hasSupport = options.capabilityDetector?.() ?? registry.supportsAgentTools();
    if (hasSupport) {
      try {
        return new SpecialistAgentExecutionStrategy(registry, options);
      } catch (error: unknown) {
        if (!(error instanceof SpecialistCapabilityError)) {
          throw error;
        }
      }
    }
    return new SingleAgentExecutionStrategy(options);
  }
}

function createStageManager(role: SpecialistRole, tool: Tool<UnknownContext>): StructuredAgent {
  try {
    return new Agent({
      name: `BossFlow${toPascalCase(role)}Orchestrator`,
      instructions: ORCHESTRATOR_INSTRUCTIONS,
      tools: [tool],
      toolUseBehavior: 'stop_on_first_tool',
    });
  } catch (error: unknown) {
    throw new SpecialistCapabilityError(`Unable to create the ${role} stage manager.`, error);
  }
}

function createSpecialistTool(
  role: SpecialistRole,
  specialist: Specialists[SpecialistRole],
): Tool<UnknownContext> {
  try {
    return specialist.asTool();
  } catch (error: unknown) {
    throw new SpecialistCapabilityError(
      `Unable to expose the ${role} specialist as a tool.`,
      error,
    );
  }
}

function toPascalCase(value: string): string {
  return value
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
}
