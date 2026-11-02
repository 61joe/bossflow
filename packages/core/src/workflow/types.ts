import type {
  ApprovalRecord,
  ArtifactReference,
  TerminalFailure,
  WorktreeMetadata,
} from '../contracts/index.js';

export type WorkflowStage =
  | 'spec'
  | 'plan'
  | 'plan_approval'
  | 'build'
  | 'verify'
  | 'review'
  | 'review_approval'
  | 'completed'
  | 'blocked'
  | 'failed';

export interface WorkflowRun {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly repositoryPath: string;
  readonly goal: string;
  readonly modelProfile: string;
  readonly model?: string | undefined;
  readonly stage: WorkflowStage;
  readonly workflowRevision?: number | undefined;
  readonly approvals?: readonly ApprovalRecord[] | undefined;
  readonly worktree?: WorktreeMetadata | undefined;
  readonly artifacts?: readonly ArtifactReference[] | undefined;
  readonly failure?: TerminalFailure | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TransitionWorkflowOptions {
  readonly failure?: TerminalFailure | undefined;
}

export type TransitionResult =
  | {
      readonly ok: true;
      readonly run: WorkflowRun;
    }
  | {
      readonly ok: false;
      readonly from: WorkflowStage;
      readonly to: WorkflowStage;
      readonly reason: string;
    };
