import { randomUUID } from 'node:crypto';

import {
  GitWorktreeManager,
  generateReviewResult,
  generateSpecification,
  generateTechnicalPlan,
} from '@bossflow/core';
import type { WorkflowRun } from '@bossflow/core';

import { ApprovalService } from './approval-service.js';
import { PlanningService } from './planning-service.js';
import { ResumePipeline } from './resume-pipeline.js';
import { RetryService } from './retry-service.js';
import { RunEvidence } from './run-evidence.js';
import { StatusService } from './status-service.js';
import type {
  ApproveWorkflowOptions,
  ResumeWorkflowOptions,
  RetryWorkflowOptions,
  RunWorkflowOptions,
  RunWorkflowResult,
  WorkflowServiceOptions,
  WorkflowStatusReport,
} from './types.js';

export class WorkflowService {
  readonly #store;
  readonly #generateSpecification;
  readonly #planning;
  readonly #evidence;
  readonly #resumePipeline;
  readonly #approveService;
  readonly #retryService;
  readonly #statusService;

  constructor(options: WorkflowServiceOptions) {
    const now = options.now ?? (() => new Date());
    const generateSpecificationFunction = options.generateSpecification ?? generateSpecification;
    const evidence = new RunEvidence({ store: options.store });
    const planning = new PlanningService({
      store: options.store,
      generateTechnicalPlan: options.generateTechnicalPlan ?? generateTechnicalPlan,
      now,
    });
    const approvals = new ApprovalService({
      store: options.store,
      evidence,
      now,
      createId: options.createId ?? randomUUID,
    });
    const worktreeManager = options.worktreeManager ?? new GitWorktreeManager();
    const retry = new RetryService({
      store: options.store,
      worktreeManager,
      evidence,
      now,
    });

    this.#store = options.store;
    this.#generateSpecification = generateSpecificationFunction;
    this.#planning = planning;
    this.#evidence = evidence;
    this.#resumePipeline = new ResumePipeline({
      store: options.store,
      implementer: options.implementer,
      worktreeManager,
      evidence,
      approvals,
      planning,
      generateReview: options.generateReview ?? generateReviewResult,
      now,
    });
    this.#approveService = approvals;
    this.#retryService = retry;
    this.#statusService = new StatusService({ evidence, approvals, retry });
  }

  async getRun(runId: string): Promise<WorkflowRun> {
    return this.#evidence.readRun(runId);
  }

  async run(options: RunWorkflowOptions): Promise<RunWorkflowResult> {
    const repositoryRoot = options.projectContext.profile.repositoryRoot;
    const run = await this.#store.create({
      repositoryPath: repositoryRoot,
      goal: options.goal,
      modelProfile: options.modelProfile,
      projectProfile: {
        ...options.projectContext.profile,
        confirmedByUser: options.confirmedProject,
      },
      ...(options.modelRuntime.model === undefined ? {} : { model: options.modelRuntime.model }),
    });
    const specification = await this.#generateSpecification(options.goal, {
      modelRuntime: options.modelRuntime,
    });
    await this.#planning.persistSpecification(run, specification);
    if (options.stopAfterSpec) {
      return {
        run: await this.#evidence.readRun(run.id),
        specification,
      };
    }
    const planResult = await this.#planning.generateAndPersistPlan(
      run,
      specification,
      options.projectContext,
      options.modelRuntime,
    );
    return { run: planResult.run, specification, plan: planResult.plan };
  }

  async resume(options: ResumeWorkflowOptions): Promise<WorkflowRun> {
    return this.#resumePipeline.resume(options);
  }

  async retry(options: RetryWorkflowOptions): Promise<WorkflowRun> {
    const prepared = await this.#retryService.prepare(options);
    return this.#resumePipeline.resumePrepared(prepared, options);
  }

  async approve(options: ApproveWorkflowOptions): Promise<WorkflowRun> {
    return this.#approveService.approve(options);
  }

  async status(runId: string): Promise<WorkflowStatusReport> {
    return this.#statusService.status(runId);
  }
}
