import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  PersistedImplementationRecordSchema,
  ReviewResultSchema,
  VerificationReportSchema,
  parseWorkflowRun,
  redactUnknown,
} from '@bossflow/core';
import type {
  ApprovalAction,
  ApprovalRecord,
  ArtifactReference,
  WorkflowRun,
} from '@bossflow/core';

import { ConformanceReportSchema } from './schema.js';
import type {
  BuildConformanceReportOptions,
  ConformanceReport,
  WriteConformanceReportOptions,
} from './types.js';

export async function buildConformanceReport(
  options: BuildConformanceReportOptions,
): Promise<ConformanceReport> {
  const runDirectory = path.join(options.runsRoot, options.runId);
  const run = parseWorkflowRun(
    JSON.parse(await readFile(path.join(runDirectory, 'run.json'), 'utf8')),
  );
  // WorkflowRunSchema defaults these arrays during parse.
  const artifacts = run.artifacts as readonly ArtifactReference[];
  const approvals = run.approvals as readonly ApprovalRecord[];
  const artifactHashes = await hashArtifacts(artifacts, runDirectory);
  const implementation = await readOptionalImplementation(artifacts, runDirectory);
  const verification = await readOptionalVerification(artifacts, runDirectory);
  const review = await readOptionalReview(artifacts, runDirectory);
  const report = {
    schemaVersion: 1 as const,
    adapterId: 'codex' as const,
    scenarioId: options.scenario.id,
    projectProfile: {
      id: options.scenario.projectProfile,
      packageManager: options.scenario.packageManager,
      languages: options.scenario.languages,
    },
    runId: run.id,
    stage: run.stage,
    outcome: deriveOutcome(run),
    ...incompleteStage(run),
    changedPaths: implementation?.changedPaths ?? [],
    verification: mapVerification(verification),
    reviewFindings: mapReviewFindings(review),
    userInterventions: approvals.map(
      (approval) => `${approval.gate}:${approval.decision} by ${approval.actor}`,
    ),
    authorizedExternalActions: collectExternalActions(approvals),
    artifactHashes,
    startedAt: run.createdAt,
    endedAt: (options.now ?? (() => new Date()))().toISOString(),
    ...failureMessage(options.failureMessage),
  };
  return ConformanceReportSchema.parse(
    redactUnknown(report, {
      secrets: options.secrets ?? [],
    }),
  );
}

function deriveOutcome(run: WorkflowRun): ConformanceReport['outcome'] {
  if (run.stage === 'completed') {
    return 'completed';
  }
  return run.stage === 'blocked' ? 'blocked' : 'failed';
}

function incompleteStage(run: WorkflowRun): {
  readonly firstIncompleteStage?: WorkflowRun['stage'];
} {
  return run.stage === 'completed' ? {} : { firstIncompleteStage: run.stage };
}

function mapVerification(
  verification: Awaited<ReturnType<typeof readOptionalVerification>>,
): ConformanceReport['verification'] {
  return (
    verification?.records.map((record) => ({
      commandId: record.result.commandId,
      status: record.result.status,
      ...(record.result.exitCode === undefined ? {} : { exitCode: record.result.exitCode }),
    })) ?? []
  );
}

function mapReviewFindings(
  review: Awaited<ReturnType<typeof readOptionalReview>>,
): ConformanceReport['reviewFindings'] {
  return (
    review?.findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      title: finding.title,
      status: finding.status,
      ...(finding.verificationCommandId === undefined
        ? {}
        : { verificationCommandId: finding.verificationCommandId }),
    })) ?? []
  );
}

function collectExternalActions(
  approvals: readonly ApprovalRecord[],
): ConformanceReport['authorizedExternalActions'] {
  return [
    ...new Set(
      approvals.flatMap((approval) => {
        if (approval.gate !== 'external-action') {
          return [];
        }
        // ApprovalRecordSchema requires actions for external-action approvals.
        return approval.actions as readonly ApprovalAction[];
      }),
    ),
  ];
}

function failureMessage(value: string | undefined): { readonly failureMessage?: string } {
  return value === undefined ? {} : { failureMessage: value };
}

export async function writeConformanceReport(
  options: WriteConformanceReportOptions,
): Promise<string> {
  await mkdir(options.outputDirectory, { recursive: true });
  const reportPath = path.join(
    options.outputDirectory,
    `${options.report.scenarioId}-${options.report.runId}.json`,
  );
  await writeFile(reportPath, `${JSON.stringify(options.report, null, 2)}\n`, 'utf8');
  return reportPath;
}

async function hashArtifacts(
  artifacts: readonly ArtifactReference[],
  runDirectory: string,
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {
    'run.json': hashContent(await readFile(path.join(runDirectory, 'run.json'))),
  };
  for (const artifact of artifacts) {
    if (artifact.sha256 === undefined) {
      continue;
    }
    const content = await readFile(artifact.path);
    const sha256 = hashContent(content);
    if (sha256 !== artifact.sha256) {
      throw new Error(`Conformance artifact "${artifact.fileName}" has been modified.`);
    }
    hashes[artifact.fileName] = sha256;
  }
  return hashes;
}

function hashContent(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function readOptionalImplementation(
  artifacts: readonly ArtifactReference[],
  runDirectory: string,
) {
  const content = await readOptionalArtifact(artifacts, runDirectory, 'implementation.json');
  return content === undefined
    ? undefined
    : PersistedImplementationRecordSchema.parse(JSON.parse(content));
}

async function readOptionalVerification(
  artifacts: readonly ArtifactReference[],
  runDirectory: string,
) {
  const content = await readOptionalArtifact(artifacts, runDirectory, 'verification.json');
  return content === undefined ? undefined : VerificationReportSchema.parse(JSON.parse(content));
}

async function readOptionalReview(artifacts: readonly ArtifactReference[], runDirectory: string) {
  const content = await readOptionalArtifact(artifacts, runDirectory, 'review.json');
  return content === undefined ? undefined : ReviewResultSchema.parse(JSON.parse(content));
}

async function readOptionalArtifact(
  artifacts: readonly ArtifactReference[],
  runDirectory: string,
  fileName: string,
): Promise<string | undefined> {
  if (!artifacts.some((artifact) => artifact.fileName === fileName)) {
    return undefined;
  }
  return readFile(path.join(runDirectory, fileName), 'utf8');
}
