import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { INITIAL_WORKFLOW_STAGE } from '../workflow/index.js';
import type { WorkflowRun } from '../workflow/index.js';
import { REQUEST_ARTIFACT_FILE, RUN_METADATA_FILE } from './constant.js';
import type { CreateRunInput, FileRunStoreOptions, RunStore } from './types.js';

export class FileRunStore implements RunStore {
  readonly #runsRoot: string;

  constructor(options: FileRunStoreOptions) {
    this.#runsRoot = path.resolve(options.runsRoot);
  }

  async create(input: CreateRunInput): Promise<WorkflowRun> {
    const goal = input.goal.trim();
    if (goal.length === 0) {
      throw new Error('Run goal must not be empty.');
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const run: WorkflowRun = {
      schemaVersion: 1,
      id,
      repositoryPath: path.resolve(input.repositoryPath),
      goal,
      modelProfile: input.modelProfile,
      ...(input.model === undefined ? {} : { model: input.model }),
      stage: INITIAL_WORKFLOW_STAGE,
      createdAt: now,
      updatedAt: now,
    };

    await mkdir(this.#runDirectory(run), { recursive: true });
    await this.#writeAtomic(
      this.#artifactPath(run, RUN_METADATA_FILE),
      JSON.stringify(run, null, 2),
    );
    await this.#writeAtomic(
      this.#artifactPath(run, REQUEST_ARTIFACT_FILE),
      `# Run request\n\n${goal}\n`,
    );

    return run;
  }

  async writeJson(run: WorkflowRun, fileName: string, value: unknown): Promise<string> {
    const targetPath = this.#artifactPath(run, fileName);
    await this.#writeAtomic(targetPath, JSON.stringify(value, null, 2));
    return targetPath;
  }

  async writeMarkdown(run: WorkflowRun, fileName: string, content: string): Promise<string> {
    const targetPath = this.#artifactPath(run, fileName);
    await this.#writeAtomic(targetPath, content);
    return targetPath;
  }

  #runDirectory(run: WorkflowRun): string {
    return path.join(this.#runsRoot, run.id);
  }

  #artifactPath(run: WorkflowRun, fileName: string): string {
    if (path.basename(fileName) !== fileName || fileName.length === 0) {
      throw new Error(`Invalid artifact file name: "${fileName}".`);
    }

    return path.join(this.#runDirectory(run), fileName);
  }

  async #writeAtomic(targetPath: string, content: string): Promise<void> {
    const tempPath = `${targetPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, targetPath);
  }
}
