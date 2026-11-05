import type { WorkflowRun } from '@bossflow/core';

import { PLAN_JSON_FILE, REVIEW_JSON_FILE } from './constant.js';
import type { StatusServiceOptions, WorkflowStatusReport } from './types.js';

export class StatusService {
  readonly #evidence;
  readonly #approvals;
  readonly #retry;

  constructor(options: StatusServiceOptions) {
    this.#evidence = options.evidence;
    this.#approvals = options.approvals;
    this.#retry = options.retry;
  }

  async status(runId: string): Promise<WorkflowStatusReport> {
    const run = await this.#evidence.readRun(runId);
    const verification = await this.#evidence.readVerification(run);
    const review = await this.#evidence.readReview(run);
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
      nextAction: await this.#nextAction(run),
    };
  }

  async #nextAction(run: WorkflowRun): Promise<string> {
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
      case 'failed':
        return await this.#retryNextAction(run);
    }
  }

  async #retryNextAction(run: WorkflowRun): Promise<string> {
    const inspection = await this.#retry.inspect(run.id);
    if (inspection === undefined) {
      return `Inspect "${run.id}" retry blockers; the configured Run Store cannot prepare a guarded retry.`;
    }
    if (inspection.verify.available) {
      return `bossflow retry ${run.id} --from verify`;
    }
    if (inspection.build.available) {
      return `bossflow retry ${run.id} --from build`;
    }
    return `Inspect "${run.id}" retry blockers: ${inspection.build.reason}`;
  }

  #planApprovalNextAction(run: WorkflowRun): string {
    const artifact = this.#evidence.findArtifact(run, PLAN_JSON_FILE, 'plan');
    return artifact !== undefined && this.#approvals.hasApproval(run, 'plan', artifact)
      ? `bossflow resume ${run.id}`
      : `bossflow approve ${run.id} --gate plan`;
  }

  #reviewApprovalNextAction(run: WorkflowRun): string {
    const artifact = this.#evidence.findArtifact(run, REVIEW_JSON_FILE, 'review');
    return artifact !== undefined && this.#approvals.hasApproval(run, 'review', artifact)
      ? `bossflow resume ${run.id}`
      : `bossflow approve ${run.id} --gate review --action <commit|push|merge|pr>`;
  }
}
