import { TechnicalPlanSchema } from '@bossflow/core';
import type {
  ApprovalAction,
  ApprovalRecord,
  ArtifactReference,
  WorkflowRun,
} from '@bossflow/core';

import { CLI_EXIT_CODES, PLAN_JSON_FILE, REVIEW_JSON_FILE } from './constant.js';
import { WorkflowCliError } from './error.js';
import { adoptPlanVerificationCommands, sameVerificationIds } from './plan-verification-policy.js';
import type {
  ApprovalServiceOptions,
  ApproveWorkflowOptions,
  PlanVerificationAdoption,
  WorkflowApprovalCoordinator,
} from './types.js';

export class ApprovalService implements WorkflowApprovalCoordinator {
  readonly #store;
  readonly #evidence;
  readonly #now;
  readonly #createId;

  constructor(options: ApprovalServiceOptions) {
    this.#store = options.store;
    this.#evidence = options.evidence;
    this.#now = options.now;
    this.#createId = options.createId;
  }

  async approve(options: ApproveWorkflowOptions): Promise<WorkflowRun> {
    const run = await this.#evidence.readRun(options.runId);
    return options.gate === 'plan'
      ? this.#approvePlan(run, options)
      : this.#approveReview(run, options);
  }

  hasApproval(run: WorkflowRun, gate: 'plan' | 'review', artifact: ArtifactReference): boolean {
    return this.#findCurrentApproval(run, gate, artifact) !== undefined;
  }

  async requireCurrentApproval(
    run: WorkflowRun,
    gate: 'plan' | 'review',
    artifactFileName: string,
  ): Promise<void> {
    const artifact = this.#evidence.requireArtifact(
      run,
      artifactFileName,
      gate === 'plan' ? 'plan' : 'review',
    );
    await this.#evidence.readRequiredArtifact(run, artifactFileName);
    if (!this.hasApproval(run, gate, artifact)) {
      throw new WorkflowCliError(
        `Run "${run.id}" requires "${gate}" approval before resume.`,
        CLI_EXIT_CODES.APPROVAL_REQUIRED,
        `Run "bossflow approve ${run.id} --gate ${gate}".`,
      );
    }
  }

  async requireHistoricalPlanApproval(run: WorkflowRun, artifactFileName: string): Promise<void> {
    const artifact = this.#evidence.requireArtifact(run, artifactFileName, 'plan');
    await this.#evidence.readRequiredArtifact(run, artifactFileName);
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

  hasApprovedAction(run: WorkflowRun, action: ApprovalAction): boolean {
    const revision = run.workflowRevision ?? 1;
    return (run.approvals ?? []).some(
      (approval) =>
        approval.gate === 'external-action' &&
        approval.decision === 'approved' &&
        approval.workflowRevision === revision &&
        approval.actions?.includes(action) === true,
    );
  }

  async #approvePlan(run: WorkflowRun, options: ApproveWorkflowOptions): Promise<WorkflowRun> {
    this.#requireStage(run, 'plan_approval', 'Plan approval');
    if (options.actions.length > 0) {
      throw new WorkflowCliError(
        'External actions can only be approved at the review gate.',
        CLI_EXIT_CODES.USAGE_ERROR,
      );
    }
    const artifact = this.#evidence.requireArtifact(run, PLAN_JSON_FILE, 'plan');
    const content = await this.#evidence.readRequiredArtifact(run, PLAN_JSON_FILE);
    const requestedVerificationIds = options.verificationCommandIds ?? [];
    const existingApproval = this.#findCurrentApproval(run, 'plan', artifact);
    if (existingApproval !== undefined) {
      if (
        sameVerificationIds(existingApproval.verificationCommandIds ?? [], requestedVerificationIds)
      ) {
        return run;
      }
      throw new WorkflowCliError(
        'Plan approval is already recorded for this revision.',
        CLI_EXIT_CODES.USAGE_ERROR,
        'Use "bossflow retry" to adopt additional Plan verification commands.',
      );
    }
    const verification =
      requestedVerificationIds.length === 0
        ? undefined
        : adoptPlanVerificationCommands(
            run.projectProfile,
            TechnicalPlanSchema.parse(JSON.parse(content)),
            requestedVerificationIds,
          );
    return this.#store.save({
      ...run,
      approvals: [
        ...(run.approvals ?? []),
        this.#approvalRecord(run, 'plan', artifact, options.actor, options.note, verification),
      ],
      ...(verification === undefined ? {} : { projectProfile: verification.projectProfile }),
      updatedAt: this.#now().toISOString(),
    });
  }

  async #approveReview(run: WorkflowRun, options: ApproveWorkflowOptions): Promise<WorkflowRun> {
    this.#requireStage(run, 'review_approval', 'Review approval');
    if ((options.verificationCommandIds ?? []).length > 0) {
      throw new WorkflowCliError(
        'Verification command adoption is only available at Plan approval or retry.',
        CLI_EXIT_CODES.USAGE_ERROR,
      );
    }
    const artifact = this.#evidence.requireArtifact(run, REVIEW_JSON_FILE, 'review');
    await this.#evidence.readRequiredArtifact(run, REVIEW_JSON_FILE);
    const approvals = [...(run.approvals ?? [])];
    const originalApprovalCount = approvals.length;
    if (!this.hasApproval(run, 'review', artifact)) {
      approvals.push(this.#approvalRecord(run, 'review', artifact, options.actor, options.note));
    }
    for (const action of uniqueActions(options.actions)) {
      if (!this.hasApprovedAction(run, action)) {
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

  #requireStage(run: WorkflowRun, expected: WorkflowRun['stage'], action: string): void {
    if (run.stage !== expected) {
      throw new WorkflowCliError(
        `${action} requires stage "${expected}"; current stage is "${run.stage}".`,
        CLI_EXIT_CODES.APPROVAL_REQUIRED,
        `Run "bossflow status ${run.id}" to inspect the current stage.`,
      );
    }
  }

  #findCurrentApproval(
    run: WorkflowRun,
    gate: 'plan' | 'review',
    artifact: ArtifactReference,
  ): ApprovalRecord | undefined {
    const revision = run.workflowRevision ?? 1;
    return [...(run.approvals ?? [])]
      .reverse()
      .find(
        (approval) =>
          approval.gate === gate &&
          approval.decision === 'approved' &&
          approval.workflowRevision === revision &&
          approval.artifactFileName === artifact.fileName &&
          approval.artifactSha256 === artifact.sha256,
      );
  }

  #approvalRecord(
    run: WorkflowRun,
    gate: 'plan' | 'review',
    artifact: ArtifactReference,
    actor: string,
    note: string | undefined,
    verification?: PlanVerificationAdoption | undefined,
  ): ApprovalRecord {
    return {
      id: this.#createId(),
      gate,
      decision: 'approved',
      actor,
      decidedAt: this.#now().toISOString(),
      workflowRevision: run.workflowRevision ?? 1,
      artifactFileName: artifact.fileName,
      artifactSha256: artifact.sha256 as string,
      ...(verification === undefined
        ? {}
        : {
            verificationCommandIds: verification.commandIds,
            verificationCommands: verification.commands,
          }),
      ...(note === undefined ? {} : { notes: note }),
    };
  }

  #externalActionApproval(
    run: WorkflowRun,
    action: ApprovalAction,
    actor: string,
    note: string | undefined,
  ): ApprovalRecord {
    return {
      id: this.#createId(),
      gate: 'external-action',
      decision: 'approved',
      actor,
      decidedAt: this.#now().toISOString(),
      workflowRevision: run.workflowRevision ?? 1,
      actions: [action],
      ...(note === undefined ? {} : { notes: note }),
    };
  }
}

function uniqueActions(actions: readonly ApprovalAction[]): ApprovalAction[] {
  return [...new Set(actions)];
}
