import type { ProjectProfile } from '../project-context/index.js';
import type { ImplementationWorktreeWorkspace } from '../implementation/index.js';
import type { BeginRetryOptions } from '../run-store/index.js';
import type { RunStore } from '../run-store/index.js';
import type { WorkflowRun } from '../workflow/index.js';

export type RetryOrigin = 'build' | 'verify';
export type RetryErrorCode = 'approval-required' | 'blocked' | 'failed' | 'missing-artifact';

export type RetryCheck =
  | {
      readonly available: true;
    }
  | {
      readonly available: false;
      readonly reason: string;
    };

export interface RetryInspection {
  readonly build: RetryCheck;
  readonly verify: RetryCheck;
}

export interface RetryRunStore extends RunStore {
  beginRetry(runId: string, options: BeginRetryOptions): Promise<WorkflowRun>;
}

export interface RetryCoordinatorOptions {
  readonly store: RetryRunStore;
  readonly worktreeManager: ImplementationWorktreeWorkspace;
  readonly now?: () => Date;
}

export interface PrepareRetryOptions {
  readonly run: WorkflowRun;
  readonly from: RetryOrigin;
  readonly projectProfile?: ProjectProfile | undefined;
}
