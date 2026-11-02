import type {
  TransitionResult,
  TransitionWorkflowOptions,
  WorkflowRun,
  WorkflowStage,
} from '../workflow/index.js';
import type { ProjectProfile } from '../project-context/index.js';

export interface CreateRunInput {
  readonly repositoryPath: string;
  readonly goal: string;
  readonly modelProfile: string;
  readonly model?: string;
  readonly projectProfile?: ProjectProfile;
}

export interface FileRunStoreOptions {
  readonly runsRoot: string;
  readonly lockTimeoutMs?: number;
  readonly lockRetryDelayMs?: number;
  readonly lockStaleMs?: number;
}

export interface RunStore {
  create(input: CreateRunInput): Promise<WorkflowRun>;
  read(runId: string): Promise<WorkflowRun>;
  save(run: WorkflowRun): Promise<WorkflowRun>;
  transition(
    runId: string,
    to: WorkflowStage,
    updatedAt: string,
    options?: TransitionWorkflowOptions,
  ): Promise<TransitionResult>;
  writeJson(run: WorkflowRun, fileName: string, value: unknown): Promise<string>;
  writeMarkdown(run: WorkflowRun, fileName: string, content: string): Promise<string>;
}
