import type { ImplementationResult, TechnicalPlan, WorktreeMetadata } from '../contracts/index.js';
import type { RunStore } from '../run-store/index.js';
import type { WorkflowRun } from '../workflow/index.js';
import type { GitWorktreeManager } from '../worktree/index.js';
import type { WorktreeDiff, WorktreeGitStatus } from '../worktree/index.js';

export interface WorktreeImplementerContext {
  readonly runId: string;
  readonly repositoryRoot: string;
  readonly worktreePath: string;
  readonly baseCommit: string;
  readonly plan: TechnicalPlan;
  readonly approvedPaths: readonly string[];
  readonly signal?: AbortSignal | undefined;
}

export type WorktreeImplementer = (
  context: WorktreeImplementerContext,
) => Promise<ImplementationResult>;

export interface ExecuteImplementationOptions {
  readonly runId: string;
  readonly implementer: WorktreeImplementer;
  readonly signal?: AbortSignal | undefined;
}

export interface PersistedImplementationRecord {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly result: ImplementationResult;
  readonly baseCommit: string;
  readonly changedPaths: readonly string[];
  readonly sensitivePaths: readonly string[];
  readonly unexpectedPaths: readonly string[];
  readonly patchFileName?: string | undefined;
  readonly patchSha256?: string | undefined;
}

export type ImplementationOutcome =
  | {
      readonly status: 'implemented';
      readonly run: WorkflowRun;
      readonly result: ImplementationResult;
      readonly worktree: WorktreeMetadata;
      readonly diff: WorktreeDiff;
    }
  | {
      readonly status: 'blocked';
      readonly run: WorkflowRun;
      readonly result: ImplementationResult;
      readonly worktree: WorktreeMetadata;
      readonly diff: WorktreeDiff;
      readonly reasons: readonly string[];
    }
  | {
      readonly status: 'already-completed';
      readonly run: WorkflowRun;
      readonly worktree?: WorktreeMetadata | undefined;
    };

export interface ImplementationWorktreeWorkspace {
  create(
    options: Parameters<GitWorktreeManager['create']>[0],
  ): ReturnType<GitWorktreeManager['create']>;
  readStatus(repositoryPath: string): Promise<WorktreeGitStatus>;
  collectDiff(metadata: WorktreeMetadata): Promise<WorktreeDiff>;
}

export interface ImplementationCoordinatorOptions {
  readonly store: RunStore;
  readonly worktreeManager: ImplementationWorktreeWorkspace;
  readonly now?: () => Date;
}
