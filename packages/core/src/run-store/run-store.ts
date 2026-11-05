/* eslint-disable max-lines -- Run Store keeps lock-scoped mutation and recovery operations together. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { RUN_ID_PATTERN } from '../contracts/index.js';
import type { ArtifactKind, ArtifactReference } from '../contracts/index.js';
import {
  INITIAL_WORKFLOW_REVISION,
  INITIAL_WORKFLOW_STAGE,
  parseWorkflowRun,
  prepareRetryWorkflow,
  transitionWorkflow,
} from '../workflow/index.js';
import type {
  PersistedWorkflowRun,
  TransitionResult,
  TransitionWorkflowOptions,
  WorkflowRun,
  WorkflowStage,
} from '../workflow/index.js';
import {
  LOCKS_DIRECTORY,
  LOCK_RETRY_DELAY_MS,
  LOCK_STALE_MS,
  LOCK_WAIT_TIMEOUT_MS,
  REQUEST_ARTIFACT_FILE,
  RUN_METADATA_FILE,
} from './constant.js';
import type { BeginRetryOptions, CreateRunInput, FileRunStoreOptions, RunStore } from './types.js';

export class FileRunStore implements RunStore {
  readonly #runsRoot: string;
  readonly #lockTimeoutMs: number;
  readonly #lockRetryDelayMs: number;
  readonly #lockStaleMs: number;

  constructor(options: FileRunStoreOptions) {
    this.#runsRoot = path.resolve(options.runsRoot);
    this.#lockTimeoutMs = options.lockTimeoutMs ?? LOCK_WAIT_TIMEOUT_MS;
    this.#lockRetryDelayMs = options.lockRetryDelayMs ?? LOCK_RETRY_DELAY_MS;
    this.#lockStaleMs = options.lockStaleMs ?? LOCK_STALE_MS;
  }

  async create(input: CreateRunInput): Promise<WorkflowRun> {
    const goal = input.goal.trim();
    if (goal.length === 0) {
      throw new Error('Run goal must not be empty.');
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const requestContent = `# Run request\n\n${goal}\n`;
    const run: PersistedWorkflowRun = {
      schemaVersion: 1,
      id,
      repositoryPath: path.resolve(input.repositoryPath),
      goal,
      modelProfile: input.modelProfile,
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.projectProfile === undefined ? {} : { projectProfile: input.projectProfile }),
      stage: INITIAL_WORKFLOW_STAGE,
      attempt: 1,
      workflowRevision: INITIAL_WORKFLOW_REVISION,
      approvals: [],
      artifacts: [],
      createdAt: now,
      updatedAt: now,
    };

    await mkdir(this.#runDirectory(run), { recursive: true });
    const requestPath = this.#artifactPath(run, REQUEST_ARTIFACT_FILE);
    await this.#writeAtomic(requestPath, requestContent);

    const runWithRequest = withArtifact(
      run,
      createArtifactReference('request', requestPath, requestContent, now, 1),
    );
    await this.#writeAtomic(
      this.#artifactPath(runWithRequest, RUN_METADATA_FILE),
      JSON.stringify(runWithRequest, null, 2),
    );

    return runWithRequest;
  }

  async read(runId: string): Promise<WorkflowRun> {
    assertValidRunId(runId);
    return this.#readUnlocked(runId);
  }

  async save(run: WorkflowRun): Promise<WorkflowRun> {
    assertValidRunId(run.id);
    const validatedRun = parseWorkflowRun(run);
    return this.#withRunLock(validatedRun.id, async () => {
      try {
        const currentRun = await this.#readUnlocked(validatedRun.id);
        const currentRevision = currentRun.workflowRevision as number;
        const incomingRevision = validatedRun.workflowRevision as number;
        const incomingAttempt = validatedRun.attempt;
        const currentAttempt = currentRun.attempt;
        if (incomingAttempt < currentAttempt) {
          throw new Error(
            `Stale run state for "${validatedRun.id}": attempt ${incomingAttempt} ` +
              `cannot overwrite attempt ${currentAttempt}.`,
          );
        }
        if (
          incomingRevision < currentRevision ||
          (incomingRevision === currentRevision && validatedRun.updatedAt < currentRun.updatedAt)
        ) {
          throw new Error(
            `Stale run state for "${validatedRun.id}": revision ${incomingRevision} ` +
              `cannot overwrite revision ${currentRevision}.`,
          );
        }
      } catch (error: unknown) {
        if (!isFileMissingError(error)) {
          throw error;
        }
      }

      return this.#saveUnlocked(validatedRun);
    });
  }

  async archiveArtifacts(
    runId: string,
    fileNames: readonly string[],
    updatedAt: string,
  ): Promise<WorkflowRun> {
    assertValidRunId(runId);
    return this.#withRunLock(runId, async () => {
      const run = await this.#readUnlocked(runId);
      return this.#saveUnlocked(await this.#archiveArtifactsUnlocked(run, fileNames, updatedAt));
    });
  }

  async beginRetry(runId: string, options: BeginRetryOptions): Promise<WorkflowRun> {
    assertValidRunId(runId);
    return this.#withRunLock(runId, async () => {
      const run = await this.#readUnlocked(runId);
      if (run.stage !== 'blocked' && run.stage !== 'failed') {
        throw new Error(`Run "${runId}" is no longer retryable at stage "${run.stage}".`);
      }
      if (run.attempt !== options.expectedAttempt) {
        throw new Error(
          `Run "${runId}" attempt changed from ${options.expectedAttempt} to ${run.attempt}.`,
        );
      }
      if (run.workflowRevision !== options.expectedWorkflowRevision) {
        throw new Error(
          `Run "${runId}" workflow revision changed from ` +
            `${options.expectedWorkflowRevision} to ${run.workflowRevision}.`,
        );
      }
      if (run.updatedAt !== options.expectedUpdatedAt) {
        throw new Error(
          `Run "${runId}" changed after retry validation; expected ${options.expectedUpdatedAt} ` +
            `but found ${run.updatedAt}.`,
        );
      }

      const archived = await this.#archiveArtifactsUnlocked(
        run,
        options.evidenceFileNames,
        options.updatedAt,
      );
      const prepared = prepareRetryWorkflow(archived, options.target, options.updatedAt);
      return this.#saveUnlocked({
        ...prepared,
        attempt: options.expectedAttempt + 1,
        ...(options.projectProfile === undefined ? {} : { projectProfile: options.projectProfile }),
        updatedAt: options.updatedAt,
      });
    });
  }

  async #archiveArtifactsUnlocked(
    initialRun: PersistedWorkflowRun,
    fileNames: readonly string[],
    updatedAt: string,
  ): Promise<WorkflowRun> {
    let run = initialRun;
    for (const fileName of new Set(fileNames)) {
      const artifacts = run.artifacts;
      const artifact = [...artifacts]
        .reverse()
        .find(
          (candidate) => candidate.fileName === fileName && candidate.supersededAt === undefined,
        );
      if (artifact === undefined) {
        continue;
      }
      const content = await readFile(this.#artifactPath(run, artifact.fileName), 'utf8');
      if (artifact.sha256 !== undefined) {
        const sha256 = createHash('sha256').update(content).digest('hex');
        if (sha256 !== artifact.sha256) {
          throw new Error(`Artifact "${fileName}" has been modified.`);
        }
      }
      // ArtifactReferenceSchema backfills this value for every artifact read by FileRunStore.
      const artifactAttempt = artifact.attempt as number;
      const archiveFileName = `attempt-${artifactAttempt}-${fileName}`;
      const archivePath = this.#artifactPath(run, archiveFileName);
      await this.#writeAtomic(archivePath, content);
      const archived = createArtifactReference(
        artifact.kind,
        archivePath,
        content,
        updatedAt,
        artifactAttempt,
        updatedAt,
      );
      run = {
        ...run,
        artifacts: [...artifacts.filter((candidate) => candidate !== artifact), archived],
        updatedAt,
      };
    }
    return run;
  }

  async transition(
    runId: string,
    to: WorkflowStage,
    updatedAt: string,
    options: TransitionWorkflowOptions = {},
  ): Promise<TransitionResult> {
    assertValidRunId(runId);
    return this.#withRunLock(runId, async () => {
      const run = await this.#readUnlocked(runId);
      const result = transitionWorkflow(run, to, updatedAt, options);
      if (!result.ok || run.stage === to) {
        return result;
      }

      return {
        ok: true,
        run: await this.#saveUnlocked(result.run),
      };
    });
  }

  async writeJson(run: WorkflowRun, fileName: string, value: unknown): Promise<string> {
    assertValidRunId(run.id);
    return this.#withRunLock(run.id, async () => {
      const targetPath = this.#artifactPath(run, fileName);
      const content = JSON.stringify(value, null, 2);
      await this.#writeAtomic(targetPath, content);
      await this.#registerArtifactUnlocked(run.id, targetPath, content);
      return targetPath;
    });
  }

  async writeMarkdown(run: WorkflowRun, fileName: string, content: string): Promise<string> {
    assertValidRunId(run.id);
    return this.#withRunLock(run.id, async () => {
      const targetPath = this.#artifactPath(run, fileName);
      await this.#writeAtomic(targetPath, content);
      await this.#registerArtifactUnlocked(run.id, targetPath, content);
      return targetPath;
    });
  }

  async readText(run: WorkflowRun, fileName: string): Promise<string> {
    assertValidRunId(run.id);
    return readFile(this.#artifactPath(run, fileName), 'utf8');
  }

  #runDirectory(run: WorkflowRun): string {
    assertValidRunId(run.id);
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

  async #readUnlocked(runId: string): Promise<PersistedWorkflowRun> {
    const content = await readFile(path.join(this.#runsRoot, runId, RUN_METADATA_FILE), 'utf8');
    return parseWorkflowRun(JSON.parse(content));
  }

  async #saveUnlocked(run: WorkflowRun): Promise<PersistedWorkflowRun> {
    const validatedRun = parseWorkflowRun(run);
    await mkdir(this.#runDirectory(validatedRun), { recursive: true });
    await this.#writeAtomic(
      this.#artifactPath(validatedRun, RUN_METADATA_FILE),
      JSON.stringify(validatedRun, null, 2),
    );
    return validatedRun;
  }

  async #registerArtifactUnlocked(
    runId: string,
    artifactPath: string,
    content: string,
  ): Promise<void> {
    const run = await this.#readUnlocked(runId);
    const createdAt = new Date().toISOString();
    const updatedRun = withArtifact(
      run,
      createArtifactReference(
        artifactKindForFileName(path.basename(artifactPath)),
        artifactPath,
        content,
        createdAt,
        run.attempt,
      ),
    );
    await this.#saveUnlocked(updatedRun);
  }

  async #withRunLock<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    assertValidRunId(runId);
    const locksDirectory = path.join(this.#runsRoot, LOCKS_DIRECTORY);
    const lockDirectory = path.join(locksDirectory, `${runId}.lock`);
    const deadline = Date.now() + this.#lockTimeoutMs;

    await mkdir(locksDirectory, { recursive: true });
    while (true) {
      try {
        await mkdir(lockDirectory);
        break;
      } catch (error: unknown) {
        if (!isFileExistsError(error)) {
          throw error;
        }
        if (Date.now() >= deadline) {
          if (await isStaleLock(lockDirectory, this.#lockStaleMs)) {
            await rm(lockDirectory, { recursive: true, force: true });
            continue;
          }
          throw new Error(`Timed out acquiring run lock for "${runId}".`, {
            cause: error,
          });
        }
        await delay(this.#lockRetryDelayMs);
      }
    }

    try {
      return await operation();
    } finally {
      await rm(lockDirectory, { recursive: true, force: true });
    }
  }
}

function withArtifact(
  run: PersistedWorkflowRun,
  artifact: ArtifactReference,
): PersistedWorkflowRun {
  const artifacts = (run.artifacts as readonly ArtifactReference[]).filter(
    (existing) => existing.path !== artifact.path,
  );
  return {
    ...run,
    artifacts: [...artifacts, artifact],
    updatedAt: artifact.createdAt,
  };
}

function assertValidRunId(runId: string): void {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Invalid run ID: "${runId}".`);
  }
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

async function isStaleLock(lockDirectory: string, staleMs: number): Promise<boolean> {
  try {
    const lockStat = await stat(lockDirectory);
    return Date.now() - lockStat.mtimeMs >= staleMs;
  } catch (error: unknown) {
    if (isFileMissingError(error)) {
      return true;
    }
    throw error;
  }
}

function isFileMissingError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function createArtifactReference(
  kind: ArtifactKind,
  artifactPath: string,
  content: string,
  createdAt: string,
  attempt: number,
  supersededAt?: string,
): ArtifactReference {
  return {
    kind,
    fileName: path.basename(artifactPath),
    path: artifactPath,
    createdAt,
    attempt,
    ...(supersededAt === undefined ? {} : { supersededAt }),
    sizeBytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function artifactKindForFileName(fileName: string): ArtifactKind {
  const extensionIndex = fileName.indexOf('.');
  const stem = extensionIndex === -1 ? fileName : fileName.slice(0, extensionIndex);
  switch (stem) {
    case 'request':
    case 'spec':
    case 'plan':
    case 'implementation':
    case 'decision':
    case 'verification':
    case 'review':
    case 'summary':
      return stem;
    default:
      return 'other';
  }
}
