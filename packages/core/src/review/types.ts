import type { ReviewResult, RunSummary } from '../contracts/index.js';
import type { ReviewerAgentInput } from '../agents/index.js';
import type { RunStore } from '../run-store/index.js';
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
