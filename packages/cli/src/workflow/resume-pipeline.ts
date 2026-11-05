import {
  ImplementationCoordinator,
  ReviewCoordinator,
  VerificationCoordinator,
  redactText,
} from '@bossflow/core';
import type {
  ImplementationResult,
  ModelRuntime,
  WorkflowRun,
  WorkflowStage,
} from '@bossflow/core';

import { CLI_EXIT_CODES, PLAN_JSON_FILE, REVIEW_JSON_FILE } from './constant.js';
import { WorkflowCliError } from './error.js';
import type { ResumePipelineOptions, ResumeWorkflowOptions } from './types.js';

type ActiveWorkflowStage = Exclude<WorkflowStage, 'blocked' | 'failed'>;
type ActiveWorkflowRun = WorkflowRun & { readonly stage: ActiveWorkflowStage };

export class ResumePipeline {
  readonly #store;
  readonly #implementer;
  readonly #worktreeManager;
  readonly #evidence;
  readonly #approvals;
  readonly #planning;
  readonly #generateReview;
  readonly #now;

  constructor(options: ResumePipelineOptions) {
    this.#store = options.store;
    this.#implementer = options.implementer;
    this.#worktreeManager = options.worktreeManager;
    this.#evidence = options.evidence;
    this.#approvals = options.approvals;
    this.#planning = options.planning;
    this.#generateReview = options.generateReview;
    this.#now = options.now;
  }

  async resume(options: ResumeWorkflowOptions): Promise<WorkflowRun> {
    const run = await this.#evidence.readRun(options.runId);
    if (run.stage === 'blocked') {
      throw new WorkflowCliError(
        `Run "${run.id}" is blocked.`,
        CLI_EXIT_CODES.BLOCKED,
        `Run "bossflow status ${run.id}" to inspect the blocking artifact.`,
      );
    }
    if (run.stage === 'failed') {
      throw new WorkflowCliError(
        run.failure?.message ?? `Run "${run.id}" has failed.`,
        CLI_EXIT_CODES.FAILED,
        `Run "bossflow status ${run.id}" to inspect failure metadata.`,
      );
    }
    return this.resumePrepared(run, options);
  }

  async resumePrepared(run: WorkflowRun, options: ResumeWorkflowOptions): Promise<WorkflowRun> {
    if (run.stage === 'blocked' || run.stage === 'failed') {
      throw new WorkflowCliError(
        `Run "${run.id}" is not active and cannot be resumed without retry.`,
        CLI_EXIT_CODES.BLOCKED,
        `Run "bossflow status ${run.id}" to inspect the blocking evidence.`,
      );
    }
    return this.#resumeActiveStage(run as ActiveWorkflowRun, options);
  }

  async #resumeActiveStage(
    run: ActiveWorkflowRun,
    options: ResumeWorkflowOptions,
  ): Promise<WorkflowRun> {
    switch (run.stage) {
      case 'spec':
        return this.#resumeSpec(run, this.#requireModelRuntime(options));
      case 'plan':
        return this.#resumePlan(run, this.#requireModelRuntime(options));
      case 'plan_approval':
        await this.#approvals.requireCurrentApproval(run, 'plan', PLAN_JSON_FILE);
        return this.#resumeImplementation(run, {
          ...options,
          modelRuntime: this.#requireModelRuntime(options),
        });
      case 'build':
        await this.#approvals.requireHistoricalPlanApproval(run, PLAN_JSON_FILE);
        return this.#resumeImplementation(run, {
          ...options,
          modelRuntime: this.#requireModelRuntime(options),
        });
      case 'verify':
        return this.#resumeVerification(run, {
          ...options,
          modelRuntime: this.#requireModelRuntime(options),
        });
      case 'review':
        return this.#resumeReview(run, this.#requireModelRuntime(options));
      case 'review_approval':
        await this.#approvals.requireCurrentApproval(run, 'review', REVIEW_JSON_FILE);
        return this.#transition(run, 'completed');
      case 'completed':
        return run;
    }
  }

  async #resumeSpec(run: WorkflowRun, runtime: ModelRuntime): Promise<WorkflowRun> {
    const specification = await this.#evidence.readSpecification(run);
    const projectContext = await this.#planning.loadProjectContext(run);
    return (
      await this.#planning.generateAndPersistPlan(run, specification, projectContext, runtime)
    ).run;
  }

  async #resumePlan(run: WorkflowRun, runtime: ModelRuntime): Promise<WorkflowRun> {
    const specification = await this.#evidence.readSpecification(run);
    const existingPlan = await this.#evidence.readTechnicalPlan(run);
    if (existingPlan !== undefined) {
      return this.#transition(run, 'plan_approval');
    }
    const projectContext = await this.#planning.loadProjectContext(run);
    return (
      await this.#planning.generateAndPersistPlan(run, specification, projectContext, runtime)
    ).run;
  }

  async #resumeImplementation(
    run: WorkflowRun,
    options: ResumeWorkflowOptions & { readonly modelRuntime: ModelRuntime },
  ): Promise<WorkflowRun> {
    const implementation = await new ImplementationCoordinator({
      store: this.#store,
      worktreeManager: this.#worktreeManager,
      now: this.#now,
    }).execute({
      runId: run.id,
      implementer: async (context) =>
        redactImplementationResult(await this.#implementer(context), options.redactionSecrets),
    });
    if (implementation.status === 'blocked') {
      throw new WorkflowCliError(
        `Implementation blocked: ${implementation.reasons.join(' ')}`,
        CLI_EXIT_CODES.BLOCKED,
        `Run "bossflow status ${run.id}" to inspect implementation evidence.`,
      );
    }
    return this.#resumeVerification(implementation.run, options);
  }

  async #resumeVerification(
    run: WorkflowRun,
    options: ResumeWorkflowOptions & { readonly modelRuntime: ModelRuntime },
  ): Promise<WorkflowRun> {
    const verification = await new VerificationCoordinator({
      store: this.#store,
      now: this.#now,
      secrets: options.redactionSecrets,
    }).verify({ runId: run.id });
    if (verification.status === 'failed') {
      throw new WorkflowCliError(
        `Verification failed at command "${verification.failedCommandId}".`,
        CLI_EXIT_CODES.BLOCKED,
        `Run "bossflow status ${run.id}" to inspect bounded command output.`,
      );
    }
    return this.#resumeReview(verification.run, options.modelRuntime);
  }

  async #resumeReview(run: WorkflowRun, runtime: ModelRuntime): Promise<WorkflowRun> {
    const review = await new ReviewCoordinator({
      store: this.#store,
      now: this.#now,
      reviewer: (input) => this.#generateReview(input, { modelRuntime: runtime }),
    }).review({ runId: run.id });
    if (review.status === 'blocked') {
      throw new WorkflowCliError(
        `Review blocked with ${review.review.unresolvedFindingIds.length} unresolved findings.`,
        CLI_EXIT_CODES.BLOCKED,
        `Run "bossflow status ${run.id}" to inspect review findings.`,
      );
    }
    return review.run;
  }

  #requireModelRuntime(options: ResumeWorkflowOptions): ModelRuntime {
    if (options.modelRuntime === undefined) {
      throw new WorkflowCliError(
        'This workflow stage requires a configured model runtime.',
        CLI_EXIT_CODES.USAGE_ERROR,
        'Configure a model profile and credential before resuming this stage.',
      );
    }
    return options.modelRuntime;
  }

  async #transition(run: WorkflowRun, stage: WorkflowRun['stage']): Promise<WorkflowRun> {
    const transition = await this.#store.transition(run.id, stage, this.#now().toISOString());
    if (!transition.ok) {
      throw new WorkflowCliError(transition.reason, CLI_EXIT_CODES.GENERAL_ERROR);
    }
    return transition.run;
  }
}

function redactImplementationResult(
  result: ImplementationResult,
  secrets: readonly string[],
): ImplementationResult {
  const options = { secrets };
  return {
    ...result,
    summary: redactText(result.summary, options),
    changedPaths: result.changedPaths.map((entry) => redactText(entry, options)),
    testChanges: result.testChanges.map((entry) => redactText(entry, options)),
    notes: result.notes.map((entry) => redactText(entry, options)),
    ...(result.failure === undefined
      ? {}
      : {
          failure: {
            ...result.failure,
            diagnostic: redactText(result.failure.diagnostic, options),
          },
        }),
  };
}
