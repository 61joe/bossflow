import { createHash } from 'node:crypto';

import { ReviewResultSchema, RunSummarySchema, TechnicalPlanSchema } from '../contracts/index.js';
import type {
  ReviewResult,
  RunSummary,
  TechnicalPlan,
  VerificationResult,
} from '../contracts/index.js';
import type { DevelopmentSpecification, ReviewerAgentInput } from '../agents/index.js';
import { DevelopmentSpecificationSchema } from '../agents/index.js';
import { hasBlockingReviewFindings } from '../agents/index.js';
import { IMPLEMENTATION_PATCH_FILE } from '../implementation/index.js';
import { redactUnknown } from '../redaction/index.js';
import { VERIFICATION_JSON_FILE } from '../verification/index.js';
import { VerificationReportSchema } from '../verification/index.js';
import type { WorkflowRun } from '../workflow/index.js';
import {
  MAX_REVIEW_DIFF_BYTES,
  REVIEW_JSON_FILE,
  REVIEW_MARKDOWN_FILE,
  SUMMARY_JSON_FILE,
  SUMMARY_MARKDOWN_FILE,
} from './constant.js';
import { renderReview, renderSummary } from './renderer.js';
import type { ReviewCoordinatorOptions, ReviewOutcome, ReviewWorkflowOptions } from './types.js';

export class ReviewCoordinator {
  readonly #store;
  readonly #reviewer;
  readonly #now;

  constructor(options: ReviewCoordinatorOptions) {
    this.#store = options.store;
    this.#reviewer = options.reviewer;
    this.#now = options.now ?? (() => new Date());
  }

  async review(options: ReviewWorkflowOptions): Promise<ReviewOutcome> {
    const run = await this.#store.read(options.runId);
    const recovered = await this.#recover(run);
    if (recovered !== undefined) {
      return recovered;
    }
    if (run.stage !== 'review') {
      throw new Error(`Review requires the review stage; current stage is "${run.stage}".`);
    }
    const specification = await this.#loadSpecification(run);
    const plan = await this.#loadApprovedPlan(run);
    const verification = await this.#loadVerification(run);
    const diff = createReviewDiffSummary(
      await this.#loadArtifactText(run, IMPLEMENTATION_PATCH_FILE, false),
    );
    const input: ReviewerAgentInput = {
      specification,
      plan,
      diff,
      verificationEvidence: verification.records.map((record) => record.result),
    };
    const review = ReviewResultSchema.parse(
      redactUnknown(enforceCoverage(await this.#reviewer(input), specification)),
    );
    const blocked = hasBlockingReviewFindings(review);
    const summary = RunSummarySchema.parse(
      redactUnknown(
        createSummary(
          run.id,
          plan,
          verification.records.map((record) => record.result),
          review,
          blocked,
        ),
      ),
    );
    await this.#persist(run, review, summary);
    const persisted = await this.#store.read(run.id);
    const target = blocked ? 'blocked' : 'review_approval';
    const transition = await this.#store.transition(
      persisted.id,
      target,
      this.#now().toISOString(),
    );
    if (!transition.ok) {
      throw new Error(transition.reason);
    }
    return {
      status: blocked ? 'blocked' : 'ready-for-approval',
      run: transition.run,
      review,
      summary,
    };
  }

  async #recover(run: WorkflowRun): Promise<ReviewOutcome | undefined> {
    const artifact = run.artifacts?.find(
      (candidate) => candidate.kind === 'review' && candidate.fileName === REVIEW_JSON_FILE,
    );
    if (artifact?.sha256 === undefined) {
      return undefined;
    }
    const content = await this.#store.readText(run, REVIEW_JSON_FILE);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== artifact.sha256) {
      throw new Error(`Review artifact "${REVIEW_JSON_FILE}" has been modified.`);
    }
    const review = ReviewResultSchema.parse(JSON.parse(content));
    await this.#loadArtifactText(run, REVIEW_MARKDOWN_FILE, true);
    const target = hasBlockingReviewFindings(review) ? 'blocked' : 'review_approval';
    const blocked = target === 'blocked';
    const summary = await this.#recoverSummary(run, review, blocked);
    const currentRun = await this.#store.read(run.id);
    if (currentRun.stage === target) {
      return {
        status: 'already-completed',
        run: currentRun,
        review,
        summary,
      };
    }
    if (currentRun.stage !== 'review') {
      throw new Error(`Review artifact cannot recover stage "${currentRun.stage}".`);
    }
    const transition = await this.#store.transition(
      currentRun.id,
      target,
      this.#now().toISOString(),
    );
    if (!transition.ok) {
      throw new Error(transition.reason);
    }
    return {
      status: 'already-completed',
      run: transition.run,
      review,
      summary,
    };
  }

  async #recoverSummary(
    run: WorkflowRun,
    review: ReviewResult,
    blocked: boolean,
  ): Promise<RunSummary> {
    const plan = await this.#loadApprovedPlan(run);
    const verification = await this.#loadVerification(run);
    const expectedSummary = RunSummarySchema.parse(
      redactUnknown(
        createSummary(
          run.id,
          plan,
          verification.records.map((record) => record.result),
          review,
          blocked,
        ),
      ),
    );
    const summaryArtifact = findArtifact(run, SUMMARY_JSON_FILE, 'summary');
    if (summaryArtifact?.sha256 === undefined) {
      await this.#persistSummary(run, expectedSummary);
      return expectedSummary;
    }

    const content = await this.#loadArtifactText(run, SUMMARY_JSON_FILE, true);
    const persistedSummary = RunSummarySchema.parse(JSON.parse(content));
    if (JSON.stringify(persistedSummary) !== JSON.stringify(expectedSummary)) {
      await this.#persistSummary(run, expectedSummary);
      return expectedSummary;
    }
    return expectedSummary;
  }

  async #loadSpecification(run: WorkflowRun): Promise<DevelopmentSpecification> {
    const content = await this.#loadArtifactText(run, 'spec.json', true);
    return DevelopmentSpecificationSchema.parse(JSON.parse(content));
  }

  async #loadApprovedPlan(run: WorkflowRun) {
    const content = await this.#loadArtifactText(run, 'plan.json', true);
    const planArtifact = findArtifact(run, 'plan.json', 'plan');
    const approval = [...(run.approvals ?? [])]
      .reverse()
      .find(
        (record) =>
          record.gate === 'plan' &&
          record.decision === 'approved' &&
          record.artifactFileName === 'plan.json' &&
          record.artifactSha256 === planArtifact?.sha256,
      );
    if (approval === undefined) {
      throw new Error(`Run "${run.id}" has no matching plan approval.`);
    }
    return TechnicalPlanSchema.parse(JSON.parse(content));
  }

  async #loadVerification(run: WorkflowRun) {
    const content = await this.#loadArtifactText(run, VERIFICATION_JSON_FILE, true);
    const report = VerificationReportSchema.parse(JSON.parse(content));
    if (report.status !== 'passed') {
      throw new Error('Review cannot start from a failed verification report.');
    }
    return report;
  }

  async #loadArtifactText(run: WorkflowRun, fileName: string, required: boolean): Promise<string> {
    const artifact = run.artifacts?.find((candidate) => candidate.fileName === fileName);
    if (artifact?.sha256 === undefined) {
      if (required) {
        throw new Error(`Run "${run.id}" has no artifact "${fileName}".`);
      }
      return '';
    }
    const content = await this.#store.readText(run, fileName);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== artifact.sha256) {
      throw new Error(`Artifact "${fileName}" has been modified.`);
    }
    return content;
  }

  async #persist(run: WorkflowRun, reviewResult: ReviewResult, summary: RunSummary): Promise<void> {
    await this.#store.writeMarkdown(run, REVIEW_MARKDOWN_FILE, renderReview(reviewResult));
    await this.#store.writeJson(run, REVIEW_JSON_FILE, reviewResult);
    await this.#persistSummary(run, summary);
  }

  async #persistSummary(run: WorkflowRun, summary: RunSummary): Promise<void> {
    await this.#store.writeMarkdown(run, SUMMARY_MARKDOWN_FILE, renderSummary(summary));
    await this.#store.writeJson(run, SUMMARY_JSON_FILE, summary);
  }
}

function enforceCoverage(
  review: ReviewResult,
  specification: DevelopmentSpecification,
): ReviewResult {
  const incompleteCriteria = specification.acceptanceCriteria.filter((criterion) => {
    const coverage = review.requirementCoverage.filter(
      (candidate) => candidate.criterion.trim() === criterion.trim(),
    );
    return !coverage.some(
      (candidate) => candidate.status === 'covered' && candidate.evidence.length > 0,
    );
  });
  if (incompleteCriteria.length === 0) {
    return review;
  }
  const usedIds = new Set(review.findings.map((finding) => finding.id));
  const findings = incompleteCriteria.map((criterion) => {
    const mappedStatuses = review.requirementCoverage
      .filter((coverage) => coverage.criterion.trim() === criterion.trim())
      .map((coverage) => coverage.status);
    return {
      id: nextCoverageFindingId(usedIds),
      severity: 'P1' as const,
      title:
        mappedStatuses.length === 0
          ? 'Acceptance criterion is not mapped'
          : 'Acceptance criterion is not fully covered',
      description:
        mappedStatuses.length === 0
          ? `Review evidence does not cover: ${criterion}`
          : `Review maps "${criterion}" as ${mappedStatuses.join(', ')} without complete evidence.`,
      status: 'open' as const,
    };
  });
  return ReviewResultSchema.parse({
    ...review,
    findings: [...review.findings, ...findings],
    unresolvedFindingIds: [
      ...review.unresolvedFindingIds,
      ...findings.map((finding) => finding.id),
    ],
  });
}

function nextCoverageFindingId(usedIds: Set<string>): string {
  let index = 1;
  while (usedIds.has(`missing-coverage-${index}`)) {
    index += 1;
  }
  const id = `missing-coverage-${index}`;
  usedIds.add(id);
  return id;
}

function createSummary(
  runId: string,
  plan: TechnicalPlan,
  verification: readonly VerificationResult[],
  review: ReviewResult,
  blocked: boolean,
): RunSummary {
  return RunSummarySchema.parse({
    schemaVersion: 1,
    runId,
    status: blocked ? 'blocked' : 'completed',
    completedWork: plan.tasks.map((task) => task.title),
    verification,
    reviewFindings: review.findings,
    remainingRisks: plan.risks.map((risk) => risk.description),
    pendingActions: blocked
      ? ['Resolve unresolved review findings and run Review again.']
      : ['Review the changes and explicitly approve any commit, push, or PR action.'],
  });
}

function findArtifact(run: WorkflowRun, fileName: string, kind: string) {
  return run.artifacts?.find(
    (artifact) => artifact.fileName === fileName && artifact.kind === kind,
  );
}

function createReviewDiffSummary(diff: string): string {
  if (diff.length === 0) {
    return '';
  }

  const changedPaths = extractChangedPaths(diff);
  const displayedPaths = changedPaths.slice(0, 20).map((changedPath) => `- ${changedPath}`);
  if (changedPaths.length > displayedPaths.length) {
    displayedPaths.push('- ... additional paths omitted');
  }
  const summaryLines = [
    '[DIFF SUMMARY]',
    `sizeBytes: ${Buffer.byteLength(diff)}`,
    `changedFiles: ${changedPaths.length}`,
    ...displayedPaths,
    '',
    '[DIFF CONTENT]',
    diff,
  ];
  const fullSummary = summaryLines.join('\n');
  if (Buffer.byteLength(fullSummary) <= MAX_REVIEW_DIFF_BYTES) {
    return fullSummary;
  }

  const prefix = [...summaryLines.slice(0, -1), ''].join('\n');
  const suffix = '\n[DIFF_TRUNCATED]\nFull patch remains in implementation.patch.';
  const availableBytes = Math.max(
    0,
    // A truncated UTF-8 code point becomes a replacement character of up to three bytes.
    MAX_REVIEW_DIFF_BYTES - Buffer.byteLength(prefix) - Buffer.byteLength(suffix) - 3,
  );
  const truncatedDiff = Buffer.from(diff).subarray(0, availableBytes).toString('utf8');
  return `${prefix}${truncatedDiff}${suffix}`;
}

function extractChangedPaths(diff: string): string[] {
  return diff
    .split('\n')
    .map((line) => /^diff --git a\/(.+) b\/(.+)$/.exec(line)?.[2])
    .filter((changedPath): changedPath is string => changedPath !== undefined)
    .map((changedPath) => changedPath.slice(0, 160));
}
