import type { Agent, AgentOutputType, UnknownContext } from '@openai/agents';
import type { z } from 'zod';

import type { TechnicalPlan, VerificationCommand, VerificationResult } from '../contracts/index.js';
import type { ModelRuntime } from '../models/index.js';

export interface DevelopmentSpecification {
  readonly title: string;
  readonly problem: string;
  readonly scope: readonly string[];
  readonly nonGoals: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly constraints: readonly string[];
}

export interface AgentBaseOptions {
  readonly modelRuntime?: ModelRuntime;
  readonly maxValidationRetries?: number;
}

export type GenerateSpecificationOptions = AgentBaseOptions;

export type SpecialistRole = 'product' | 'tech-lead' | 'implementer' | 'reviewer';

export type AgentOrchestratorExecutionMode = 'specialists' | 'single-agent';

export type StructuredAgent = Agent<UnknownContext, AgentOutputType>;

export type SpecialistCapabilityDetector = () => boolean;

export interface TechnicalPlanAgentInput {
  readonly specification: DevelopmentSpecification;
  readonly repositoryContext: string;
}

export interface ImplementationAgentInput {
  readonly plan: TechnicalPlan;
  readonly approvedPaths: readonly string[];
  readonly testExpectations: readonly string[];
  readonly repositoryContext: string;
}

/**
 * Distinguishes commands authorized by the persisted project profile from advisory plan checks.
 *
 * @remarks
 * Reviewer findings may block on missing required authoritative commands. Advisory plan commands
 * were not selected for execution and must not become blocking solely because evidence is absent.
 */
export interface ReviewerVerificationContext {
  readonly authoritativeCommands: readonly VerificationCommand[];
  readonly executedCommandIds: readonly string[];
  readonly advisoryPlanCommands: readonly VerificationCommand[];
  readonly missingRequiredCommandIds: readonly string[];
}

export interface ReviewerAgentInput {
  readonly specification: DevelopmentSpecification;
  readonly plan: TechnicalPlan;
  readonly diff: string;
  readonly verificationEvidence: readonly VerificationResult[];
  /** Optional for backward-compatible direct Agent callers; the workflow Coordinator always sets it. */
  readonly verificationContext?: ReviewerVerificationContext;
}

export type GenerateTechnicalPlanOptions = AgentBaseOptions;

export type GenerateImplementationResultOptions = AgentBaseOptions;

export type GenerateReviewResultOptions = AgentBaseOptions;

export interface WorkflowAgentOrchestratorOptions extends AgentBaseOptions {
  readonly capabilityDetector?: SpecialistCapabilityDetector;
}

export interface PreparedAgentExecution<T> {
  readonly role: SpecialistRole;
  readonly request: string;
  readonly schema: z.ZodType<T>;
  readonly singleAgentInstructions: string;
}

export type StructuredAgentExecutorOptions = AgentBaseOptions;

export interface ModelProbeResult {
  readonly status: 'ok';
  readonly message: string;
}
