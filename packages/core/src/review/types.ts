import type { ReviewResult, RunSummary, VerificationCommand } from '../contracts/index.js';
import type { ReviewerAgentInput } from '../agents/index.js';
import type { RunStore } from '../run-store/index.js';
import type { VerificationRecord } from '../verification/index.js';
import type { WorkflowRun } from '../workflow/index.js';

export type ReviewExecutor = (input: ReviewerAgentInput) => Promise<ReviewResult>;

export interface ReviewCoordinatorOptions {
  readonly store: RunStore;
  readonly reviewer: ReviewExecutor;
  readonly now?: () => Date;
}

export interface ReviewWorkflowOptions {
  readonly runId: string;
}

export interface DeriveReviewerVerificationContextOptions {
  readonly authoritativeCommands: readonly VerificationCommand[];
  readonly planCommands: readonly VerificationCommand[];
  readonly verificationRecords: readonly VerificationRecord[];
}

export type ReviewOutcome =
  | {
      readonly status: 'ready-for-approval';
      readonly run: WorkflowRun;
      readonly review: ReviewResult;
      readonly summary: RunSummary;
    }
  | {
      readonly status: 'blocked';
      readonly run: WorkflowRun;
      readonly review: ReviewResult;
      readonly summary: RunSummary;
    }
  | {
      readonly status: 'already-completed';
      readonly run: WorkflowRun;
      readonly review: ReviewResult;
      readonly summary: RunSummary;
    };
