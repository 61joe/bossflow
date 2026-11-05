import type {
  AgentBaseOptions,
  ApprovalAction,
  DevelopmentSpecification,
  ImplementationWorktreeWorkspace,
  ModelRuntime,
  ProjectContextBundle,
  ReviewResult,
  ReviewerAgentInput,
  RunStore,
  TechnicalPlan,
  TechnicalPlanAgentInput,
  WorkflowRun,
  WorktreeImplementer,
} from '@bossflow/core';

export interface WorkflowServiceOptions {
  readonly store: RunStore;
  readonly implementer: WorktreeImplementer;
  readonly worktreeManager?: ImplementationWorktreeWorkspace;
  readonly generateSpecification?: (
    goal: string,
    options?: AgentBaseOptions,
  ) => Promise<DevelopmentSpecification>;
  readonly generateTechnicalPlan?: (
    input: TechnicalPlanAgentInput,
    options?: AgentBaseOptions,
  ) => Promise<TechnicalPlan>;
  readonly generateReview?: (
    input: ReviewerAgentInput,
    options?: AgentBaseOptions,
  ) => Promise<ReviewResult>;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export interface RunWorkflowOptions {
  readonly goal: string;
  readonly projectContext: ProjectContextBundle;
  readonly modelRuntime: ModelRuntime;
  readonly modelProfile: string;
  readonly confirmedProject: boolean;
  readonly stopAfterSpec: boolean;
}

export interface RunWorkflowResult {
  readonly run: WorkflowRun;
  readonly specification: DevelopmentSpecification;
  readonly plan?: TechnicalPlan | undefined;
}

export interface ResumeWorkflowOptions {
  readonly runId: string;
  readonly modelRuntime?: ModelRuntime;
  readonly redactionSecrets: readonly string[];
}

export interface ApproveWorkflowOptions {
  readonly runId: string;
  readonly gate: 'plan' | 'review';
  readonly actions: readonly ApprovalAction[];
  readonly actor: string;
  readonly note?: string | undefined;
}

export interface WorkflowStatusReport {
  readonly run: WorkflowRun;
  readonly artifactLines: readonly string[];
  readonly approvalLines: readonly string[];
  readonly verificationLine: string;
  readonly reviewLine: string;
  readonly nextAction: string;
}
