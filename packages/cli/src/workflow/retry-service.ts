import { RetryCoordinator, TechnicalPlanSchema } from '@bossflow/core';
import type { RetryInspection, RetryRunStore, RunStore, WorkflowRun } from '@bossflow/core';

import { CLI_EXIT_CODES, PLAN_JSON_FILE } from './constant.js';
import { WorkflowCliError } from './error.js';
import { adoptPlanVerificationCommands } from './plan-verification-policy.js';
import type {
  RetryServiceOptions,
  RetryWorkflowOptions,
  WorkflowRetryCoordinator,
} from './types.js';
import { mapRetryError } from './workflow-error-mapper.js';

export class RetryService implements WorkflowRetryCoordinator {
  readonly #store;
  readonly #worktreeManager;
  readonly #evidence;
  readonly #now;

  constructor(options: RetryServiceOptions) {
    this.#store = options.store;
    this.#worktreeManager = options.worktreeManager;
    this.#evidence = options.evidence;
    this.#now = options.now;
  }

  async prepare(options: RetryWorkflowOptions): Promise<WorkflowRun> {
    const run = await this.#evidence.readRun(options.runId);
    const verificationIds = options.verificationCommandIds ?? [];
    const verification =
      verificationIds.length === 0
        ? undefined
        : adoptPlanVerificationCommands(
            run.projectProfile,
            TechnicalPlanSchema.parse(
              JSON.parse(await this.#evidence.readRequiredArtifact(run, PLAN_JSON_FILE)),
            ),
            verificationIds,
          );
    try {
      return await this.#createCoordinator().prepare({
        run,
        from: options.from,
        ...(verification === undefined ? {} : { projectProfile: verification.projectProfile }),
      });
    } catch (error: unknown) {
      throw mapRetryError(error);
    }
  }

  async inspect(runId: string): Promise<RetryInspection | undefined> {
    if (!isRetryRunStore(this.#store)) {
      return undefined;
    }
    return this.#createCoordinator().inspect(runId);
  }

  #createCoordinator(): RetryCoordinator {
    if (!isRetryRunStore(this.#store)) {
      throw new WorkflowCliError(
        'The configured Run Store does not support atomic retries.',
        CLI_EXIT_CODES.USAGE_ERROR,
      );
    }
    return new RetryCoordinator({
      store: this.#store,
      worktreeManager: this.#worktreeManager,
      now: this.#now,
    });
  }
}

function isRetryRunStore(store: RunStore): store is RetryRunStore {
  const candidate = store as Partial<RetryRunStore>;
  return typeof candidate.beginRetry === 'function';
}
