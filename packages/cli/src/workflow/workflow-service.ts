/* eslint-disable max-lines -- The service keeps stage orchestration and recovery transitions together for auditability. */
import { createHash, randomUUID } from 'node:crypto';

import {
  DevelopmentSpecificationSchema,
  GitWorktreeManager,
  ImplementationCoordinator,
  ReviewCoordinator,
  ReviewResultSchema,
  TechnicalPlanSchema,
  VerificationCoordinator,
  VerificationReportSchema,
  generateReviewResult,
  generateSpecification,
  generateTechnicalPlan,
  readProjectContextDocuments,
  redactText,
} from '@bossflow/core';
import type {
  ApprovalAction,
  ArtifactReference,
  DevelopmentSpecification,
  ImplementationResult,
  ImplementationWorktreeWorkspace,
  ModelRuntime,
  ProjectContextBundle,
  RunStore,
  TechnicalPlan,
  WorkflowRun,
  WorkflowStage,
} from '@bossflow/core';

import { renderSpecification } from '../specification/index.js';
import {
  CLI_EXIT_CODES,
  PLAN_JSON_FILE,
  PLAN_MARKDOWN_FILE,
  REVIEW_JSON_FILE,
  SPECIFICATION_JSON_FILE,
  SPECIFICATION_MARKDOWN_FILE,
  VERIFICATION_JSON_FILE,
} from './constant.js';
import { WorkflowCliError } from './error.js';
import { renderRepositoryContext, renderTechnicalPlan } from './renderer.js';
import type {
  ApproveWorkflowOptions,
  ResumeWorkflowOptions,
  RunWorkflowOptions,
  RunWorkflowResult,
  WorkflowServiceOptions,
  WorkflowStatusReport,
} from './types.js';

type ActiveWorkflowStage = Exclude<WorkflowStage, 'blocked' | 'failed'>;
type ActiveWorkflowRun = WorkflowRun & { readonly stage: ActiveWorkflowStage };

export class WorkflowService {
  readonly #store: RunStore;
  readonly #implementer: WorkflowServiceOptions['implementer'];
  readonly #worktreeManager: ImplementationWorktreeWorkspace;
  readonly #generateSpecification: NonNullable<WorkflowServiceOptions['generateSpecification']>;
  readonly #generateTechnicalPlan: NonNullable<WorkflowServiceOptions['generateTechnicalPlan']>;
  readonly #generateReview: NonNullable<WorkflowServiceOptions['generateReview']>;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(options: WorkflowServiceOptions) {
    this.#store = options.store;
    this.#implementer = options.implementer;
    this.#worktreeManager = options.worktreeManager ?? new GitWorktreeManager();
    this.#generateSpecification = options.generateSpecification ?? generateSpecification;
    this.#generateTechnicalPlan = options.generateTechnicalPlan ?? generateTechnicalPlan;
    this.#generateReview = options.generateReview ?? generateReviewResult;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async getRun(runId: string): Promise<WorkflowRun> {
    return this.#readRun(runId);
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
    await this.#persistSpecification(run, specification);
    if (options.stopAfterSpec) {
      return {
        run: await this.#readRun(run.id),
        specification,
      };
    }

    const planResult = await this.#generateAndPersistPlan(
      run,
      specification,
      options.projectContext,
      options.modelRuntime,
    );
    return {
      run: planResult.run,
      specification,
      plan: planResult.plan,
    };
  }

  async resume(options: ResumeWorkflowOptions): Promise<WorkflowRun> {
    const run = await this.#readRun(options.runId);
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
    // Terminal stages are handled above; the assertion narrows the remaining dispatch.
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
      case 'plan_approval': {
        await this.#requireApproval(run, 'plan', PLAN_JSON_FILE);
        return this.#resumeImplementation(run, {
          ...options,
          modelRuntime: this.#requireModelRuntime(options),
        });
      }
      case 'build':
        await this.#requireHistoricalPlanApproval(run, PLAN_JSON_FILE);
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
        await this.#requireApproval(run, 'review', REVIEW_JSON_FILE);
        return this.#transition(run, 'completed');
      case 'completed':
        return run;
    }
  }

  async approve(options: ApproveWorkflowOptions): Promise<WorkflowRun> {
    const run = await this.#readRun(options.runId);
    if (options.gate === 'plan') {
      this.#requireStage(run, 'plan_approval', 'Plan approval');
      if (options.actions.length > 0) {
        throw new WorkflowCliError(
          'External actions can only be approved at the review gate.',
          CLI_EXIT_CODES.USAGE_ERROR,
        );
      }
      const artifact = this.#requireArtifact(run, PLAN_JSON_FILE, 'plan');
      await this.#readRequiredArtifact(run, PLAN_JSON_FILE);
      if (this.#hasApproval(run, 'plan', artifact)) {
        return run;
      }
      return this.#store.save({
        ...run,
        approvals: [
          ...(run.approvals ?? []),
          this.#approvalRecord(run, 'plan', artifact, options.actor, options.note),
        ],
        updatedAt: this.#now().toISOString(),
      });
    }

    this.#requireStage(run, 'review_approval', 'Review approval');
    const artifact = this.#requireArtifact(run, REVIEW_JSON_FILE, 'review');
    await this.#readRequiredArtifact(run, REVIEW_JSON_FILE);
    const approvals = [...(run.approvals ?? [])];
    const originalApprovalCount = approvals.length;
    if (!this.#hasApproval(run, 'review', artifact)) {
      approvals.push(this.#approvalRecord(run, 'review', artifact, options.actor, options.note));
    }
    for (const action of uniqueActions(options.actions)) {
      if (!this.#hasApprovedAction(run, action)) {
        approvals.push(this.#externalActionApproval(run, action, options.actor, options.note));
      }
    }
    if (approvals.length === originalApprovalCount) {
      return run;
    }
    return this.#store.save({
      ...run,
      approvals,
      updatedAt: this.#now().toISOString(),
    });
  }

  async status(runId: string): Promise<WorkflowStatusReport> {
    const run = await this.#readRun(runId);
    const verification = await this.#readVerification(run);
    const review = await this.#readReview(run);
    const artifacts = run.artifacts ?? [];
    return {
      run,
      artifactLines: artifacts.map(
        (artifact) => `${artifact.kind}: ${artifact.path} (${artifact.sizeBytes ?? 0} bytes)`,
      ),
      approvalLines: (run.approvals ?? []).map(
        (approval) =>
          `${approval.gate}: ${approval.decision} by ${approval.actor}` +
          `${approval.actions === undefined ? '' : ` [${approval.actions.join(', ')}]`}`,
      ),
      verificationLine:
        verification === undefined
          ? 'not recorded'
          : `${verification.status} (${verification.records.length} commands)`,
      reviewLine:
        review === undefined
          ? 'not recorded'
          : `${review.unresolvedFindingIds.length} unresolved findings`,
      nextAction: this.#nextAction(run),
    };
  }

  async #resumeSpec(run: WorkflowRun, runtime: ModelRuntime): Promise<WorkflowRun> {
    const specification = await this.#readSpecification(run);
    const projectContext = await this.#loadProjectContext(run);
    return (await this.#generateAndPersistPlan(run, specification, projectContext, runtime)).run;
  }

  async #resumePlan(run: WorkflowRun, runtime: ModelRuntime): Promise<WorkflowRun> {
    const specification = await this.#readSpecification(run);
    const existingPlan = await this.#readTechnicalPlan(run);
    if (existingPlan !== undefined) {
      return this.#transition(run, 'plan_approval');
    }
    const projectContext = await this.#loadProjectContext(run);
    return (await this.#generateAndPersistPlan(run, specification, projectContext, runtime)).run;
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

  async #generateAndPersistPlan(
    run: WorkflowRun,
    specification: DevelopmentSpecification,
    projectContext: ProjectContextBundle,
    runtime: ModelRuntime,
  ): Promise<{ readonly run: WorkflowRun; readonly plan: TechnicalPlan }> {
    const planStage = await this.#transition(run, 'plan');
    const plan = await this.#generateTechnicalPlan(
      {
        specification,
        repositoryContext: renderRepositoryContext(projectContext),
      },
      { modelRuntime: runtime },
    );
    await this.#store.writeJson(planStage, PLAN_JSON_FILE, plan);
    await this.#store.writeMarkdown(planStage, PLAN_MARKDOWN_FILE, renderTechnicalPlan(plan));
    const approval = await this.#store.transition(
      planStage.id,
      'plan_approval',
      this.#now().toISOString(),
    );
    if (!approval.ok) {
      throw new WorkflowCliError(approval.reason, CLI_EXIT_CODES.GENERAL_ERROR);
    }
    return { run: approval.run, plan };
  }

  async #persistSpecification(
    run: WorkflowRun,
    specification: DevelopmentSpecification,
  ): Promise<void> {
    await this.#store.writeJson(run, SPECIFICATION_JSON_FILE, specification);
    await this.#store.writeMarkdown(
      run,
      SPECIFICATION_MARKDOWN_FILE,
      renderSpecification(specification),
    );
  }

  async #loadProjectContext(run: WorkflowRun): Promise<ProjectContextBundle> {
    const profile = run.projectProfile;
    if (profile === undefined) {
      throw new WorkflowCliError(
        `Run "${run.id}" has no persisted project profile.`,
        CLI_EXIT_CODES.MISSING_ARTIFACT,
      );
    }
    const documents = await readProjectContextDocuments(profile.repositoryRoot, [
      ...profile.planningContextFiles,
      ...profile.testConfigFiles,
    ]);
    return { profile, documents };
  }

  async #readSpecification(run: WorkflowRun): Promise<DevelopmentSpecification> {
    const content = await this.#readRequiredArtifact(run, SPECIFICATION_JSON_FILE);
    return DevelopmentSpecificationSchema.parse(JSON.parse(content));
  }

  async #readTechnicalPlan(run: WorkflowRun): Promise<TechnicalPlan | undefined> {
    const content = await this.#readOptionalArtifact(run, PLAN_JSON_FILE);
    return content === undefined ? undefined : TechnicalPlanSchema.parse(JSON.parse(content));
  }

  async #readVerification(run: WorkflowRun) {
    const content = await this.#readOptionalArtifact(run, VERIFICATION_JSON_FILE);
    return content === undefined ? undefined : VerificationReportSchema.parse(JSON.parse(content));
  }

  async #readReview(run: WorkflowRun) {
    const content = await this.#readOptionalArtifact(run, REVIEW_JSON_FILE);
    return content === undefined ? undefined : ReviewResultSchema.parse(JSON.parse(content));
  }

  async #readRequiredArtifact(run: WorkflowRun, fileName: string): Promise<string> {
    const content = await this.#readOptionalArtifact(run, fileName);
    if (content === undefined) {
      throw new WorkflowCliError(
        `Run "${run.id}" is missing required artifact "${fileName}".`,
        CLI_EXIT_CODES.MISSING_ARTIFACT,
      );
    }
    return content;
  }

  async #readOptionalArtifact(run: WorkflowRun, fileName: string): Promise<string | undefined> {
    const artifact = run.artifacts?.find(
      (candidate) => candidate.fileName === fileName && candidate.sha256 !== undefined,
    );
    if (artifact === undefined) {
      return undefined;
    }
    const content = await this.#store.readText(run, fileName);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== artifact.sha256) {
      throw new WorkflowCliError(
        `Artifact "${fileName}" has been modified.`,
        CLI_EXIT_CODES.FAILED,
      );
    }
    return content;
  }

  async #transition(run: WorkflowRun, stage: WorkflowRun['stage']): Promise<WorkflowRun> {
    const transition = await this.#store.transition(run.id, stage, this.#now().toISOString());
    if (!transition.ok) {
      throw new WorkflowCliError(transition.reason, CLI_EXIT_CODES.GENERAL_ERROR);
    }
    return transition.run;
  }

  async #requireApproval(
    run: WorkflowRun,
    gate: 'plan' | 'review',
    artifactFileName: string,
  ): Promise<void> {
    const artifact = this.#requireArtifact(
      run,
      artifactFileName,
      gate === 'plan' ? 'plan' : 'review',
    );
    await this.#readRequiredArtifact(run, artifactFileName);
    if (!this.#hasApproval(run, gate, artifact)) {
      throw new WorkflowCliError(
        `Run "${run.id}" requires "${gate}" approval before resume.`,
        CLI_EXIT_CODES.APPROVAL_REQUIRED,
        `Run "bossflow approve ${run.id} --gate ${gate}".`,
      );
    }
  }

  #requireStage(run: WorkflowRun, expected: WorkflowRun['stage'], action: string): void {
    if (run.stage !== expected) {
      throw new WorkflowCliError(
        `${action} requires stage "${expected}"; current stage is "${run.stage}".`,
        CLI_EXIT_CODES.APPROVAL_REQUIRED,
        `Run "bossflow status ${run.id}" to inspect the current stage.`,
      );
    }
  }

  #requireArtifact(run: WorkflowRun, fileName: string, kind: string): ArtifactReference {
    const artifact = [...(run.artifacts ?? [])]
      .reverse()
      .find((candidate) => candidate.fileName === fileName && candidate.kind === kind);
    if (artifact?.sha256 === undefined) {
      throw new WorkflowCliError(
        `Run "${run.id}" has no current "${fileName}" artifact.`,
        CLI_EXIT_CODES.MISSING_ARTIFACT,
        `Regenerate the stage before approving it.`,
      );
    }
    return artifact;
  }

  #hasApproval(run: WorkflowRun, gate: 'plan' | 'review', artifact: ArtifactReference): boolean {
    const revision = run.workflowRevision ?? 1;
    return [...(run.approvals ?? [])]
      .reverse()
      .some(
        (approval) =>
          approval.gate === gate &&
          approval.decision === 'approved' &&
          approval.workflowRevision === revision &&
          approval.artifactFileName === artifact.fileName &&
          approval.artifactSha256 === artifact.sha256,
      );
  }

  async #requireHistoricalPlanApproval(run: WorkflowRun, artifactFileName: string): Promise<void> {
    const artifact = this.#requireArtifact(run, artifactFileName, 'plan');
    await this.#readRequiredArtifact(run, artifactFileName);
    const hasApproval = (run.approvals ?? []).some(
      (approval) =>
        approval.gate === 'plan' &&
        approval.decision === 'approved' &&
        approval.artifactFileName === artifact.fileName &&
        approval.artifactSha256 === artifact.sha256,
    );
    if (!hasApproval) {
      throw new WorkflowCliError(
        `Run "${run.id}" has no historical "plan" approval for resume.`,
        CLI_EXIT_CODES.APPROVAL_REQUIRED,
        'Regenerate and approve the current plan artifact.',
      );
    }
  }

  #hasApprovedAction(run: WorkflowRun, action: ApprovalAction): boolean {
    const revision = run.workflowRevision ?? 1;
    return (run.approvals ?? []).some(
      (approval) =>
        approval.gate === 'external-action' &&
        approval.decision === 'approved' &&
        approval.workflowRevision === revision &&
        approval.actions?.includes(action) === true,
    );
  }

  #approvalRecord(
    run: WorkflowRun,
    gate: 'plan' | 'review',
    artifact: ArtifactReference,
    actor: string,
    note: string | undefined,
  ) {
    return {
      id: this.#createId(),
      gate,
      decision: 'approved' as const,
      actor,
      decidedAt: this.#now().toISOString(),
      workflowRevision: run.workflowRevision ?? 1,
      artifactFileName: artifact.fileName,
      artifactSha256: artifact.sha256 as string,
      ...(note === undefined ? {} : { notes: note }),
    };
  }

  #externalActionApproval(
    run: WorkflowRun,
    action: ApprovalAction,
    actor: string,
    note: string | undefined,
  ) {
    return {
      id: this.#createId(),
      gate: 'external-action' as const,
      decision: 'approved' as const,
      actor,
      decidedAt: this.#now().toISOString(),
      workflowRevision: run.workflowRevision ?? 1,
      actions: [action],
      ...(note === undefined ? {} : { notes: note }),
    };
  }

  #nextAction(run: WorkflowRun): string {
    switch (run.stage) {
      case 'spec':
      case 'plan':
      case 'build':
      case 'verify':
      case 'review':
        return `bossflow resume ${run.id}`;
      case 'plan_approval':
        return this.#planApprovalNextAction(run);
      case 'review_approval':
        return this.#reviewApprovalNextAction(run);
      case 'completed':
        return 'No action required.';
      case 'blocked':
        return `Inspect "${run.id}" blockers, correct the repository, and create a new run.`;
      case 'failed':
        return `Inspect "${run.id}" failure metadata and create a new run.`;
    }
  }

  #planApprovalNextAction(run: WorkflowRun): string {
    const artifact = this.#findArtifact(run, PLAN_JSON_FILE, 'plan');
    return artifact !== undefined && this.#hasApproval(run, 'plan', artifact)
      ? `bossflow resume ${run.id}`
      : `bossflow approve ${run.id} --gate plan`;
  }

  #reviewApprovalNextAction(run: WorkflowRun): string {
    const artifact = this.#findArtifact(run, REVIEW_JSON_FILE, 'review');
    return artifact !== undefined && this.#hasApproval(run, 'review', artifact)
      ? `bossflow resume ${run.id}`
      : `bossflow approve ${run.id} --gate review --action <commit|push|merge|pr>`;
  }

  #findArtifact(run: WorkflowRun, fileName: string, kind: string): ArtifactReference | undefined {
    return [...(run.artifacts ?? [])]
      .reverse()
      .find((candidate) => candidate.fileName === fileName && candidate.kind === kind);
  }

  async #readRun(runId: string): Promise<WorkflowRun> {
    try {
      return await this.#store.read(runId);
    } catch (error: unknown) {
      if (isMissingRunError(error)) {
        throw new WorkflowCliError(
          `Run "${runId}" was not found.`,
          CLI_EXIT_CODES.RUN_NOT_FOUND,
          'Check the run ID or list artifacts under .bossflow/runs.',
          error,
        );
      }
      throw error;
    }
  }
}

function uniqueActions(actions: readonly ApprovalAction[]): ApprovalAction[] {
  return [...new Set(actions)];
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
  };
}

function isMissingRunError(error: unknown): boolean {
  return (
    (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') ||
    (error instanceof Error && error.message.startsWith('Invalid run ID:'))
  );
}
