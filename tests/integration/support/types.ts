import type { ModelRuntime, TechnicalPlan, WorktreeImplementer } from '@bossflow/core';
import type { WorkflowServiceOptions } from '@bossflow/cli';

export type RepositoryFixtureScenario =
  'clean' | 'dirty' | 'multi-package' | 'missing-command' | 'failing-verification';

export interface RepositoryFixture {
  readonly root: string;
  readonly worktreesRoot: string;
  readonly cleanup: () => Promise<void>;
}

export interface FakeWorkflowCallCounts {
  readonly specification: number;
  readonly plan: number;
  readonly implementation: number;
  readonly review: number;
}

export interface FakeWorkflowRuntime {
  readonly runtime: ModelRuntime;
  readonly generateSpecification: NonNullable<WorkflowServiceOptions['generateSpecification']>;
  readonly generateTechnicalPlan: NonNullable<WorkflowServiceOptions['generateTechnicalPlan']>;
  readonly generateReview: NonNullable<WorkflowServiceOptions['generateReview']>;
  readonly implementer: WorktreeImplementer;
  readonly getCallCounts: () => FakeWorkflowCallCounts;
}

export interface FakeWorkflowRuntimeOptions {
  readonly reviewBlocked?: boolean;
  readonly technicalPlan?: TechnicalPlan;
  readonly implementer?: WorktreeImplementer;
  readonly reviewer?: NonNullable<WorkflowServiceOptions['generateReview']>;
}
