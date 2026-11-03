import { createHash } from 'node:crypto';

import { ImplementationResultSchema, TechnicalPlanSchema } from '../contracts/index.js';
import type { ImplementationResult, TechnicalPlan, WorktreeMetadata } from '../contracts/index.js';
import { redactText, redactUnknown } from '../redaction/index.js';
import type { WorkflowRun } from '../workflow/index.js';
import type { RunStore } from '../run-store/index.js';
import type { WorktreeDiff } from '../worktree/index.js';
import {
  APPROVED_PLAN_FILE,
  IMPLEMENTATION_JSON_FILE,
  IMPLEMENTATION_PATCH_FILE,
} from './constant.js';
import { PersistedImplementationRecordSchema } from './schema.js';
import type {
  ExecuteImplementationOptions,
  ImplementationCoordinatorOptions,
  ImplementationOutcome,
  ImplementationWorktreeWorkspace,
  PersistedImplementationRecord,
} from './types.js';

export class ImplementationCoordinator {
  readonly #store: RunStore;
  readonly #worktreeManager: ImplementationWorktreeWorkspace;
  readonly #now: () => Date;

  constructor(options: ImplementationCoordinatorOptions) {
    this.#store = options.store;
    this.#worktreeManager = options.worktreeManager;
    this.#now = options.now ?? (() => new Date());
  }

  async execute(options: ExecuteImplementationOptions): Promise<ImplementationOutcome> {
    const initialRun = await this.#store.read(options.runId);
    const plan = await this.#loadApprovedPlan(initialRun);
    const approvedPaths = plan.affectedPaths;
    const resumedRun = await this.#recoverCompletedImplementation(initialRun);
    if (resumedRun !== undefined) {
      return {
        status: 'already-completed',
        run: resumedRun,
        ...(resumedRun.worktree === undefined ? {} : { worktree: resumedRun.worktree }),
      };
    }

    let run = await this.#enterBuild(initialRun);
    const repositoryRoot = run.projectProfile?.repositoryRoot ?? run.repositoryPath;
    const mainStatusBefore = await this.#worktreeManager.readStatus(repositoryRoot);
    const worktree = await this.#ensureWorktree(run, repositoryRoot);
    run = await this.#persistWorktree(run, worktree);

    const result = await options.implementer({
      runId: run.id,
      repositoryRoot,
      worktreePath: worktree.path,
      baseCommit: worktree.baseCommit,
      plan,
      approvedPaths,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const mainStatusAfter = await this.#worktreeManager.readStatus(repositoryRoot);
    if (mainStatusBefore.fingerprint !== mainStatusAfter.fingerprint) {
      throw new Error('The main working tree changed while implementation was running.');
    }

    const diff = await this.#worktreeManager.collectDiff(worktree);
    const safeDiff: WorktreeDiff = {
      ...diff,
      patch: redactText(diff.patch),
    };
    const recordedResult: ImplementationResult = {
      ...result,
      changedPaths: safeDiff.changedPaths,
    };
    const unexpectedPaths = findUnexpectedPaths(safeDiff.changedPaths, approvedPaths);
    const reasons = getBlockingReasons(result.status, safeDiff.sensitivePaths, unexpectedPaths);
    const persistedRun = await this.#persistImplementationArtifacts({
      run,
      result: recordedResult,
      worktree,
      diff: safeDiff,
      unexpectedPaths,
    });

    if (reasons.length > 0) {
      const blocked = await this.#store.transition(
        persistedRun.id,
        'blocked',
        this.#now().toISOString(),
      );
      if (!blocked.ok) {
        throw new Error(blocked.reason);
      }
      return {
        status: 'blocked',
        run: blocked.run,
        result: recordedResult,
        worktree,
        diff: safeDiff,
        reasons,
      };
    }

    const verify = await this.#store.transition(
      persistedRun.id,
      'verify',
      this.#now().toISOString(),
    );
    if (!verify.ok) {
      throw new Error(verify.reason);
    }
    return {
      status: 'implemented',
      run: verify.run,
      result: recordedResult,
      worktree,
      diff: safeDiff,
    };
  }

  async #loadApprovedPlan(run: WorkflowRun): Promise<TechnicalPlan> {
    const planArtifact = [...(run.artifacts ?? [])]
      .reverse()
      .find((artifact) => artifact.kind === 'plan' && artifact.fileName === APPROVED_PLAN_FILE);
    if (planArtifact?.sha256 === undefined) {
      throw new Error(`Run "${run.id}" has no persisted plan artifact.`);
    }
    const approval = [...(run.approvals ?? [])]
      .reverse()
      .find(
        (record) =>
          record.gate === 'plan' &&
          record.decision === 'approved' &&
          record.artifactFileName === planArtifact.fileName &&
          record.artifactSha256 === planArtifact.sha256,
      );
    if (approval === undefined) {
      throw new Error(`Run "${run.id}" has no matching approval for its latest plan artifact.`);
    }
    const content = await this.#store.readText(run, planArtifact.fileName);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== planArtifact.sha256 || sha256 !== approval.artifactSha256) {
      throw new Error(`Approved plan artifact "${planArtifact.fileName}" has been modified.`);
    }
    return TechnicalPlanSchema.parse(JSON.parse(content));
  }

  async #recoverCompletedImplementation(run: WorkflowRun): Promise<WorkflowRun | undefined> {
    const implementationArtifact = findImplementationArtifact(run);
    if (implementationArtifact?.sha256 === undefined) {
      return undefined;
    }
    const content = await this.#store.readText(run, implementationArtifact.fileName);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== implementationArtifact.sha256) {
      throw new Error(
        `Implementation artifact "${implementationArtifact.fileName}" has been modified.`,
      );
    }
    const record = PersistedImplementationRecordSchema.parse(JSON.parse(content));
    if (record.runId !== run.id) {
      throw new Error('Implementation artifact belongs to a different run.');
    }
    await this.#verifyPersistedPatch(run, record);
    const target = isBlockedRecord(record) ? 'blocked' : 'verify';
    if (run.stage === target) {
      return run;
    }
    if (run.stage !== 'build') {
      throw new Error(
        `Implementation artifact for run "${run.id}" cannot recover stage "${run.stage}".`,
      );
    }
    const transition = await this.#store.transition(run.id, target, this.#now().toISOString());
    if (!transition.ok) {
      throw new Error(transition.reason);
    }
    return transition.run;
  }

  async #verifyPersistedPatch(
    run: WorkflowRun,
    record: PersistedImplementationRecord,
  ): Promise<void> {
    if (record.patchFileName === undefined || record.patchSha256 === undefined) {
      return;
    }
    const artifact = run.artifacts?.find(
      (candidate) =>
        candidate.kind === 'implementation' && candidate.fileName === record.patchFileName,
    );
    const content = await this.#store.readText(run, record.patchFileName);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (
      sha256 !== record.patchSha256 ||
      (artifact?.sha256 !== undefined && artifact.sha256 !== sha256)
    ) {
      throw new Error(`Implementation patch "${record.patchFileName}" has been modified.`);
    }
  }

  async #enterBuild(run: WorkflowRun): Promise<WorkflowRun> {
    if (run.stage === 'build') {
      return run;
    }
    if (run.stage !== 'plan_approval') {
      throw new Error(
        `Implementation requires the plan_approval stage; current stage is "${run.stage}".`,
      );
    }
    const transition = await this.#store.transition(run.id, 'build', this.#now().toISOString());
    if (!transition.ok) {
      throw new Error(transition.reason);
    }
    return transition.run;
  }

  async #ensureWorktree(run: WorkflowRun, repositoryRoot: string): Promise<WorktreeMetadata> {
    return this.#worktreeManager.create({
      runId: run.id,
      repositoryPath: repositoryRoot,
      baseRef: run.worktree?.baseCommit ?? 'HEAD',
      ...(run.worktree === undefined ? {} : { createdAt: run.worktree.createdAt }),
      now: this.#now().toISOString(),
    });
  }

  async #persistWorktree(run: WorkflowRun, worktree: WorktreeMetadata): Promise<WorkflowRun> {
    if (
      run.worktree?.path === worktree.path &&
      run.worktree.branch === worktree.branch &&
      run.worktree.baseCommit === worktree.baseCommit &&
      run.worktree.status === worktree.status
    ) {
      return run;
    }
    return this.#store.save({
      ...run,
      worktree,
      updatedAt: this.#now().toISOString(),
    });
  }

  async #persistImplementationArtifacts(options: {
    readonly run: WorkflowRun;
    readonly result: ImplementationResult;
    readonly worktree: WorktreeMetadata;
    readonly diff: WorktreeDiff;
    readonly unexpectedPaths: readonly string[];
  }): Promise<WorkflowRun> {
    const redactedPatch = options.diff.patch;
    const patchSha256 =
      redactedPatch.length === 0
        ? undefined
        : createHash('sha256').update(redactedPatch).digest('hex');
    if (redactedPatch.length > 0) {
      await this.#store.writeMarkdown(options.run, IMPLEMENTATION_PATCH_FILE, redactedPatch);
    }
    const record = PersistedImplementationRecordSchema.parse(
      redactUnknown({
        schemaVersion: 1,
        runId: options.run.id,
        result: ImplementationResultSchema.parse(redactUnknown(options.result)),
        baseCommit: options.worktree.baseCommit,
        changedPaths: options.diff.changedPaths,
        sensitivePaths: options.diff.sensitivePaths,
        unexpectedPaths: options.unexpectedPaths,
        ...(redactedPatch.length === 0 ? {} : { patchFileName: IMPLEMENTATION_PATCH_FILE }),
        ...(patchSha256 === undefined ? {} : { patchSha256 }),
      }),
    );
    await this.#store.writeJson(options.run, IMPLEMENTATION_JSON_FILE, record);
    return this.#store.read(options.run.id);
  }
}

function findImplementationArtifact(run: WorkflowRun) {
  return run.artifacts?.find(
    (artifact) =>
      artifact.kind === 'implementation' && artifact.fileName === IMPLEMENTATION_JSON_FILE,
  );
}

function isBlockedRecord(record: PersistedImplementationRecord): boolean {
  return (
    record.result.status === 'blocked' ||
    record.sensitivePaths.length > 0 ||
    record.unexpectedPaths.length > 0
  );
}

function findUnexpectedPaths(
  changedPaths: readonly string[],
  approvedPaths: readonly string[],
): string[] {
  return changedPaths.filter(
    (changedPath) =>
      !approvedPaths.some((approvedPath) => isPathWithinScope(changedPath, approvedPath)),
  );
}

function getBlockingReasons(
  resultStatus: ImplementationResult['status'],
  sensitivePaths: readonly string[],
  unexpectedPaths: readonly string[],
): string[] {
  return [
    ...(resultStatus === 'blocked' ? ['The implementer reported a blocked result.'] : []),
    ...(sensitivePaths.length === 0
      ? []
      : [`Sensitive files changed: ${sensitivePaths.join(', ')}.`]),
    ...(unexpectedPaths.length === 0
      ? []
      : [`Paths outside the approved scope changed: ${unexpectedPaths.join(', ')}.`]),
  ];
}

function isPathWithinScope(candidate: string, scope: string): boolean {
  const normalizedCandidate = normalizeRepositoryPath(candidate);
  const normalizedScope = normalizeRepositoryPath(scope);
  return (
    normalizedCandidate === normalizedScope || normalizedCandidate.startsWith(`${normalizedScope}/`)
  );
}

function normalizeRepositoryPath(value: string): string {
  const portablePath = value.replaceAll('\\', '/');
  if (
    portablePath.length === 0 ||
    portablePath.startsWith('/') ||
    /^[a-zA-Z]:\//.test(portablePath) ||
    portablePath.includes('\0')
  ) {
    throw new Error(`Invalid repository path "${value}".`);
  }
  const segments = portablePath.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0 || segments.includes('..')) {
    throw new Error(`Invalid repository path "${value}".`);
  }
  return segments.join('/');
}
