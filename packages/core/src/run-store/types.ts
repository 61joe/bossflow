import type { WorkflowRun } from '../workflow/index.js';

export interface CreateRunInput {
  readonly repositoryPath: string;
  readonly goal: string;
  readonly modelProfile: string;
  readonly model?: string;
}

export interface FileRunStoreOptions {
  readonly runsRoot: string;
}

export interface RunStore {
  create(input: CreateRunInput): Promise<WorkflowRun>;
  writeJson(run: WorkflowRun, fileName: string, value: unknown): Promise<string>;
  writeMarkdown(run: WorkflowRun, fileName: string, content: string): Promise<string>;
}
