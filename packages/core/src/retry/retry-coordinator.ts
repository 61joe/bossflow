import { createHash } from 'node:crypto';

import { TechnicalPlanSchema } from '../contracts/index.js';
import {
  IMPLEMENTATION_JSON_FILE,
  IMPLEMENTATION_PATCH_FILE,
  PersistedImplementationRecordSchema,
} from '../implementation/index.js';
import { findActiveArtifact } from '../run-store/index.js';
import { redactText } from '../redaction/index.js';
import { WORKTREE_BRANCH_PREFIX } from '../worktree/index.js';
import type { WorktreeMetadata } from '../contracts/index.js';
import type { WorkflowRun } from '../workflow/index.js';
import { BUILD_RETRY_EVIDENCE_FILES, VERIFY_RETRY_EVIDENCE_FILES } from './constant.js';
import { RetryError } from './error.js';
import type {
  PrepareRetryOptions,
  RetryCheck,
  RetryCoordinatorOptions,
  RetryInspection,
} from './types.js';

export class RetryCoordinator {
  readonly #store;
  readonly #worktreeManager;
  readonly #now;

  constructor(options: RetryCoordinatorOptions) {
    this.#store = options.store;
    this.#worktreeManager = options.worktreeManager;
    this.#now = options.now ?? (() => new Date());
  }

  async inspect(runId: string): Promise<RetryInspection> {
    const run = await this.#store.read(runId);
    if (run.stage !== 'blocked' && run.stage !== 'failed') {
      return unavailableInspection('Run is not blocked or failed.');
    }
    const build = await inspectOrigin(async () => {
      await this.#assertBuildEligible(run);
    });
    if (!build.available) {
      return { build, verify: build };
    }
    const verify = await inspectOrigin(async () => {
      await this.#assertVerifyEligible(run);
    });
    return { build, verify };
  }

  async prepare(options: PrepareRetryOptions): Promise<WorkflowRun> {
    this.#requireTerminal(options.run);
    await this.#assertBuildEligible(options.run);
    if (options.from === 'verify') {
      await this.#assertVerifyEligible(options.run);
    }
    const updatedAt = this.#now().toISOString();
    return this.#store.beginRetry(options.run.id, {
      target: options.from,
      expectedAttempt: options.run.attempt ?? 1,
      expectedWorkflowRevision: options.run.workflowRevision ?? 1,
      expectedUpdatedAt: options.run.updatedAt,
      evidenceFileNames:
        options.from === 'build' ? BUILD_RETRY_EVIDENCE_FILES : VERIFY_RETRY_EVIDENCE_FILES,
      updatedAt,
      ...(options.projectProfile === undefined ? {} : { projectProfile: options.projectProfile }),
    });
  }

  #requireTerminal(run: WorkflowRun): void {
    if (run.stage !== 'blocked' && run.stage !== 'failed') {
      throw new RetryError(
        `Run "${run.id}" can only be retried from blocked or failed; current stage is "${run.stage}".`,
        'approval-required',
      );
    }
  }

  async #assertBuildEligible(run: WorkflowRun): Promise<void> {
    this.#requireTerminal(run);
    await this.#loadApprovedPlan(run);
    const worktree = this.#requireWorktree(run);
    await this.#assertMainRepositoryUnchanged(run, worktree);
  }

  async #assertVerifyEligible(run: WorkflowRun): Promise<void> {
    await this.#assertBuildEligible(run);
    const worktree = this.#requireWorktree(run);
    const record = await this.#loadAcceptedImplementation(run);
    const diff = await this.#worktreeManager.collectDiff(worktree);
    const patch = redactText(diff.patch);
    const currentPatchSha256 =
      patch.length === 0 ? undefined : createHash('sha256').update(patch).digest('hex');
    if (currentPatchSha256 !== record.patchSha256) {
      throw new RetryError(
        `Run "${run.id}" Worktree changed after its accepted implementation. ` +
          `Run "bossflow retry ${run.id} --from build" to review the new implementation attempt.`,
        'blocked',
      );
    }
    this.#assertPatchArtifact(run, record.patchSha256);
  }

  async #loadAcceptedImplementation(run: WorkflowRun) {
    const artifact = findActiveArtifact(run, 'implementation', IMPLEMENTATION_JSON_FILE);
    if (artifact?.sha256 === undefined) {
      throw new RetryError(
        `Run "${run.id}" has no completed implementation evidence for Verify retry.`,
        'missing-artifact',
      );
    }
    const content = await this.#store.readText(run, IMPLEMENTATION_JSON_FILE);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== artifact.sha256) {
      throw new RetryError(
        `Implementation artifact "${IMPLEMENTATION_JSON_FILE}" has been modified.`,
        'failed',
      );
    }
    const record = PersistedImplementationRecordSchema.parse(JSON.parse(content));
    if (
      record.runId !== run.id ||
      record.result.status !== 'completed' ||
      record.sensitivePaths.length > 0 ||
      record.unexpectedPaths.length > 0
    ) {
      throw new RetryError(
        `Run "${run.id}" does not have an accepted implementation for Verify retry. ` +
          `Run "bossflow retry ${run.id} --from build" to implement the correction.`,
        'blocked',
      );
    }
    return record;
  }

  #assertPatchArtifact(run: WorkflowRun, patchSha256: string | undefined): void {
    if (patchSha256 === undefined) {
      return;
    }
    const patchArtifact = findActiveArtifact(run, 'implementation', IMPLEMENTATION_PATCH_FILE);
    if (patchArtifact?.sha256 !== patchSha256) {
      throw new RetryError(
        `Implementation patch "${IMPLEMENTATION_PATCH_FILE}" is missing or modified.`,
        'failed',
      );
    }
  }

  async #loadApprovedPlan(run: WorkflowRun): Promise<void> {
    const planArtifact = findActiveArtifact(run, 'plan', 'plan.json');
    if (planArtifact?.sha256 === undefined) {
      throw new RetryError(
        `Run "${run.id}" has no current Plan artifact for retry.`,
        'missing-artifact',
      );
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
      throw new RetryError(
        `Run "${run.id}" has no matching approval for its current Plan artifact.`,
        'approval-required',
      );
    }
    const content = await this.#store.readText(run, planArtifact.fileName);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== planArtifact.sha256) {
      throw new RetryError(
        `Approved Plan artifact "${planArtifact.fileName}" has been modified.`,
        'failed',
      );
    }
    TechnicalPlanSchema.parse(JSON.parse(content));
  }

  #requireWorktree(run: WorkflowRun): WorktreeMetadata {
    if (run.worktree?.status !== 'active') {
      throw new RetryError(
        `Run "${run.id}" has no active implementation Worktree to retry.`,
        'blocked',
      );
    }
    if (run.worktree.branch !== `${WORKTREE_BRANCH_PREFIX}${run.id}`) {
      throw new RetryError(`Run "${run.id}" Worktree branch is not owned by this run.`, 'blocked');
    }
    return run.worktree;
  }

  async #assertMainRepositoryUnchanged(
    run: WorkflowRun,
    worktree: WorktreeMetadata,
  ): Promise<void> {
    const branch = run.projectProfile?.git.branch;
    let expectedFingerprint: string;
    if (worktree.repositoryFingerprint !== undefined) {
      expectedFingerprint = worktree.repositoryFingerprint;
    } else if (branch !== undefined) {
      expectedFingerprint = createHash('sha256')
        .update(`\0${worktree.baseCommit}\0${branch}`)
        .digest('hex');
    } else {
      throw new RetryError(
        `Run "${run.id}" does not have enough metadata to verify its main worktree baseline.`,
        'missing-artifact',
      );
    }
    const repositoryRoot = run.projectProfile?.repositoryRoot ?? run.repositoryPath;
    const current = await this.#worktreeManager.readStatus(repositoryRoot);
    if (current.fingerprint !== expectedFingerprint) {
      throw new RetryError(
        `Run "${run.id}" main worktree changed after its implementation Worktree was created. ` +
          'Restore the original clean baseline before retrying, or create a new run.',
        'blocked',
      );
    }
  }
}

async function inspectOrigin(check: () => Promise<void>): Promise<RetryCheck> {
  try {
    await check();
    return { available: true };
  } catch (error: unknown) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function unavailableInspection(reason: string): RetryInspection {
  return {
    build: { available: false, reason },
    verify: { available: false, reason },
  };
}
