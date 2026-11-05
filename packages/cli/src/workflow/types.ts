import type {
  AgentBaseOptions,
  ApprovalAction,
  DevelopmentSpecification,
  ImplementationWorktreeWorkspace,
  ModelRuntime,
  ProjectContextBundle,
  ProjectProfile,
  ReviewResult,
  ReviewerAgentInput,
  RetryInspection,
  RunStore,
  TechnicalPlan,
  TechnicalPlanAgentInput,
  VerificationReport,
  ArtifactReference,
  ArtifactKind,
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

export interface RetryWorkflowOptions {
  readonly runId: string;
  readonly from: 'build' | 'verify';
  readonly modelRuntime: ModelRuntime;
  readonly redactionSecrets: readonly string[];
  readonly verificationCommandIds?: readonly string[] | undefined;
}

export interface ApproveWorkflowOptions {
  readonly runId: string;
  readonly gate: 'plan' | 'review';
  readonly actions: readonly ApprovalAction[];
  readonly verificationCommandIds?: readonly string[] | undefined;
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

export type SpecificationGenerator = NonNullable<WorkflowServiceOptions['generateSpecification']>;
export type TechnicalPlanGenerator = NonNullable<WorkflowServiceOptions['generateTechnicalPlan']>;
export type ReviewGenerator = NonNullable<WorkflowServiceOptions['generateReview']>;

export interface PlanVerificationAdoption {
  readonly commandIds: readonly string[];
  readonly commands: TechnicalPlan['verificationCommands'];
  readonly projectProfile: ProjectProfile;
}

export interface WorkflowEvidenceReader {
  readRun(runId: string): Promise<WorkflowRun>;
  readRequiredArtifact(run: WorkflowRun, fileName: string): Promise<string>;
  readOptionalArtifact(run: WorkflowRun, fileName: string): Promise<string | undefined>;
  readSpecification(run: WorkflowRun): Promise<DevelopmentSpecification>;
  readTechnicalPlan(run: WorkflowRun): Promise<TechnicalPlan | undefined>;
  readVerification(run: WorkflowRun): Promise<VerificationReport | undefined>;
  readReview(run: WorkflowRun): Promise<ReviewResult | undefined>;
  requireArtifact(run: WorkflowRun, fileName: string, kind: ArtifactKind): ArtifactReference;
  findArtifact(
    run: WorkflowRun,
    fileName: string,
    kind: ArtifactKind,
  ): ArtifactReference | undefined;
}

export interface WorkflowPlanningCoordinator {
  persistSpecification(run: WorkflowRun, specification: DevelopmentSpecification): Promise<void>;
  generateAndPersistPlan(
    run: WorkflowRun,
    specification: DevelopmentSpecification,
    projectContext: ProjectContextBundle,
    runtime: ModelRuntime,
  ): Promise<{ readonly run: WorkflowRun; readonly plan: TechnicalPlan }>;
  loadProjectContext(run: WorkflowRun): Promise<ProjectContextBundle>;
}

export interface WorkflowApprovalCoordinator {
  approve(options: ApproveWorkflowOptions): Promise<WorkflowRun>;
  hasApproval(run: WorkflowRun, gate: 'plan' | 'review', artifact: ArtifactReference): boolean;
  requireCurrentApproval(
    run: WorkflowRun,
    gate: 'plan' | 'review',
    artifactFileName: string,
  ): Promise<void>;
  requireHistoricalPlanApproval(run: WorkflowRun, artifactFileName: string): Promise<void>;
  hasApprovedAction(run: WorkflowRun, action: ApprovalAction): boolean;
}

export interface WorkflowRetryCoordinator {
  prepare(options: RetryWorkflowOptions): Promise<WorkflowRun>;
  inspect(runId: string): Promise<RetryInspection | undefined>;
}

export interface RunEvidenceOptions {
  readonly store: RunStore;
}

export interface PlanningServiceOptions {
  readonly store: RunStore;
  readonly generateTechnicalPlan: TechnicalPlanGenerator;
  readonly now: () => Date;
}

export interface ApprovalServiceOptions {
  readonly store: RunStore;
  readonly evidence: WorkflowEvidenceReader;
  readonly now: () => Date;
  readonly createId: () => string;
}

export interface ResumePipelineOptions {
  readonly store: RunStore;
  readonly implementer: WorktreeImplementer;
  readonly worktreeManager: ImplementationWorktreeWorkspace;
  readonly evidence: WorkflowEvidenceReader;
  readonly approvals: WorkflowApprovalCoordinator;
  readonly planning: WorkflowPlanningCoordinator;
  readonly generateReview: ReviewGenerator;
  readonly now: () => Date;
}

export interface RetryServiceOptions {
  readonly store: RunStore;
  readonly worktreeManager: ImplementationWorktreeWorkspace;
  readonly evidence: WorkflowEvidenceReader;
  readonly now: () => Date;
}

export interface StatusServiceOptions {
  readonly evidence: WorkflowEvidenceReader;
  readonly approvals: WorkflowApprovalCoordinator;
  readonly retry: WorkflowRetryCoordinator;
}
