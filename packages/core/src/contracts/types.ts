export type ApprovalGate = 'plan' | 'review' | 'external-action';

export type ApprovalDecision = 'approved' | 'rejected';

/** External Git actions that may be authorized after Review approval. */
export type ApprovalAction = 'commit' | 'push' | 'merge' | 'pr';

export interface ApprovalRecord {
  readonly id: string;
  readonly gate: ApprovalGate;
  readonly decision: ApprovalDecision;
  readonly actor: string;
  readonly decidedAt: string;
  readonly workflowRevision: number;
  readonly artifactFileName?: string | undefined;
  readonly artifactSha256?: string | undefined;
  /** Explicit actions authorized only for an external-action approval. */
  readonly actions?: readonly ApprovalAction[] | undefined;
  readonly notes?: string | undefined;
}

export type WorktreeStatus = 'active' | 'cleaned';

export interface WorktreeMetadata {
  readonly path: string;
  readonly branch: string;
  readonly baseCommit: string;
  readonly createdAt: string;
  readonly status: WorktreeStatus;
  readonly cleanedAt?: string | undefined;
}

export type ArtifactKind =
  | 'request'
  | 'spec'
  | 'plan'
  | 'implementation'
  | 'decision'
  | 'verification'
  | 'review'
  | 'summary'
  | 'other';

export interface ArtifactReference {
  readonly kind: ArtifactKind;
  readonly fileName: string;
  readonly path: string;
  readonly createdAt: string;
  readonly sizeBytes?: number | undefined;
  readonly sha256?: string | undefined;
}

export interface PlanTask {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly dependencies: readonly string[];
  readonly affectedPaths: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

export interface InterfaceChange {
  readonly path: string;
  readonly description: string;
}

export interface PlanRisk {
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly mitigation: string;
}

export interface VerificationCommand {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly required: boolean;
  readonly timeoutMs: number;
  readonly cwd?: string | undefined;
}

export interface TechnicalPlan {
  readonly schemaVersion: 1;
  readonly summary: string;
  readonly affectedPaths: readonly string[];
  readonly tasks: readonly PlanTask[];
  readonly interfaceChanges: readonly InterfaceChange[];
  readonly risks: readonly PlanRisk[];
  /**
   * Advisory checks proposed by planning.
   *
   * @remarks
   * Execution uses the persisted project-profile verification commands. Plan commands do not grant
   * additional execution permission.
   */
  readonly verificationCommands: readonly VerificationCommand[];
}

export interface VerificationResult {
  readonly commandId: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly exitCode?: number | undefined;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly redacted: boolean;
}

export interface ReviewFinding {
  readonly id: string;
  readonly severity: 'P0' | 'P1' | 'P2' | 'P3';
  readonly title: string;
  readonly description: string;
  readonly status: 'open' | 'resolved' | 'waived';
  readonly file?: string | undefined;
  readonly line?: number | undefined;
  /** Verification command associated with this finding, when the finding is command-specific. */
  readonly verificationCommandId?: string | undefined;
}

export interface RequirementCoverage {
  readonly requirementId: string;
  readonly criterion: string;
  readonly status: 'covered' | 'partial' | 'missing';
  readonly evidence: readonly string[];
}

export type ImplementationResultStatus = 'completed' | 'blocked';

export interface ImplementationResult {
  readonly schemaVersion: 1;
  readonly status: ImplementationResultStatus;
  readonly summary: string;
  readonly changedPaths: readonly string[];
  readonly testChanges: readonly string[];
  readonly notes: readonly string[];
}

export interface ReviewResult {
  readonly schemaVersion: 1;
  readonly summary: string;
  readonly findings: readonly ReviewFinding[];
  readonly requirementCoverage: readonly RequirementCoverage[];
  readonly unresolvedFindingIds: readonly string[];
}

export interface RunSummary {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly status: 'completed' | 'blocked' | 'failed';
  readonly completedWork: readonly string[];
  readonly verification: readonly VerificationResult[];
  readonly reviewFindings: readonly ReviewFinding[];
  readonly remainingRisks: readonly string[];
  readonly pendingActions: readonly string[];
}

export interface TerminalFailure {
  readonly stage: string;
  readonly code: string;
  readonly message: string;
  readonly occurredAt: string;
  readonly retryable: boolean;
  readonly artifact?: string | undefined;
}
