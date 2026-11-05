/* eslint-disable max-lines -- Public schema contracts remain together for a single source of truth. */
import { z } from 'zod';

import {
  APPROVAL_ACTIONS,
  APPROVAL_DECISIONS,
  APPROVAL_GATES,
  ARTIFACT_KINDS,
  COVERAGE_STATUSES,
  IMPLEMENTATION_FAILURE_KINDS,
  IMPLEMENTATION_RESULT_STATUSES,
  REVIEW_SEVERITIES,
  REVIEW_STATUSES,
  RISK_SEVERITIES,
  RUN_ID_PATTERN,
  SUMMARY_STATUSES,
  VERIFICATION_STATUSES,
  WORKTREE_STATUSES,
} from './constant.js';

const NonEmptyStringSchema = z.string().trim().min(1);
const TimestampSchema = z.iso.datetime();

export const ApprovalRecordSchema = z
  .object({
    id: NonEmptyStringSchema,
    gate: z.enum(APPROVAL_GATES),
    decision: z.enum(APPROVAL_DECISIONS),
    actor: NonEmptyStringSchema,
    decidedAt: TimestampSchema,
    workflowRevision: z.number().int().positive(),
    artifactFileName: NonEmptyStringSchema.optional(),
    artifactSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    actions: z.array(z.enum(APPROVAL_ACTIONS)).min(1).optional(),
    verificationCommandIds: z.array(NonEmptyStringSchema).min(1).optional(),
    verificationCommands: z
      .array(z.lazy(() => VerificationCommandSchema))
      .min(1)
      .optional(),
    notes: NonEmptyStringSchema.optional(),
  })
  .strict()
  .superRefine(validateApprovalRecord);

function validateApprovalRecord(
  approval: z.infer<typeof ApprovalRecordSchema>,
  context: z.RefinementCtx,
): void {
  if (approval.gate === 'external-action') {
    validateExternalActionApproval(approval, context);
    return;
  }
  validateGateApproval(approval, context);
  validateVerificationAdoption(approval, context);
}

function validateExternalActionApproval(
  approval: z.infer<typeof ApprovalRecordSchema>,
  context: z.RefinementCtx,
): void {
  if (approval.actions === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['actions'],
      message: 'External-action approvals must include at least one action.',
    });
  }
}

function validateGateApproval(
  approval: z.infer<typeof ApprovalRecordSchema>,
  context: z.RefinementCtx,
): void {
  if (approval.actions !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['actions'],
      message: 'Only external-action approvals may include actions.',
    });
  }
  if (approval.artifactFileName === undefined || approval.artifactSha256 === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'Plan and review approvals must include the approved artifact file name and hash.',
    });
  }
}

function validateVerificationAdoption(
  approval: z.infer<typeof ApprovalRecordSchema>,
  context: z.RefinementCtx,
): void {
  if (
    (approval.verificationCommandIds === undefined) !==
    (approval.verificationCommands === undefined)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['verificationCommands'],
      message: 'Verification command IDs and command snapshots must be provided together.',
    });
    return;
  }
  if (
    approval.verificationCommandIds === undefined ||
    approval.verificationCommands === undefined
  ) {
    return;
  }
  if (approval.gate !== 'plan') {
    context.addIssue({
      code: 'custom',
      path: ['verificationCommands'],
      message: 'Only plan approvals may adopt Plan verification commands.',
    });
  }
  validateVerificationCommandSnapshots(
    approval.verificationCommandIds,
    approval.verificationCommands,
    context,
  );
}

function validateVerificationCommandSnapshots(
  commandIds: readonly string[],
  verificationCommands: readonly z.infer<typeof VerificationCommandSchema>[],
  context: z.RefinementCtx,
): void {
  if (new Set(commandIds).size !== commandIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['verificationCommandIds'],
      message: 'Adopted verification command IDs must be unique.',
    });
  }
  const snapshotIds = verificationCommands.map((command) => command.id);
  if (
    snapshotIds.length !== commandIds.length ||
    new Set(snapshotIds).size !== snapshotIds.length ||
    snapshotIds.some((commandId) => !commandIds.includes(commandId)) ||
    commandIds.some((commandId) => !snapshotIds.includes(commandId))
  ) {
    context.addIssue({
      code: 'custom',
      path: ['verificationCommands'],
      message: 'Verification command snapshots must match the adopted command IDs.',
    });
  }
}

export const WorktreeMetadataSchema = z
  .object({
    path: NonEmptyStringSchema,
    branch: NonEmptyStringSchema,
    baseCommit: NonEmptyStringSchema,
    createdAt: TimestampSchema,
    status: z.enum(WORKTREE_STATUSES),
    repositoryFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    cleanedAt: TimestampSchema.optional(),
  })
  .strict();

export const ArtifactReferenceSchema = z
  .object({
    kind: z.enum(ARTIFACT_KINDS),
    fileName: NonEmptyStringSchema,
    path: NonEmptyStringSchema,
    createdAt: TimestampSchema,
    attempt: z.number().int().positive().default(1),
    supersededAt: TimestampSchema.optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export const PlanTaskSchema = z
  .object({
    id: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    dependencies: z.array(NonEmptyStringSchema),
    affectedPaths: z.array(NonEmptyStringSchema).min(1),
    acceptanceCriteria: z.array(NonEmptyStringSchema).min(1),
  })
  .strict();

export const InterfaceChangeSchema = z
  .object({
    path: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
  })
  .strict();

export const PlanRiskSchema = z
  .object({
    description: NonEmptyStringSchema,
    severity: z.enum(RISK_SEVERITIES),
    mitigation: NonEmptyStringSchema,
  })
  .strict();

export const VerificationCommandSchema = z
  .object({
    id: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    command: NonEmptyStringSchema,
    args: z.array(z.string()),
    required: z.boolean(),
    timeoutMs: z.number().int().positive(),
    cwd: NonEmptyStringSchema.optional(),
  })
  .strict();

export const TechnicalPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    summary: NonEmptyStringSchema,
    affectedPaths: z.array(NonEmptyStringSchema).min(1),
    tasks: z.array(PlanTaskSchema).min(1),
    interfaceChanges: z.array(InterfaceChangeSchema),
    risks: z.array(PlanRiskSchema),
    verificationCommands: z.array(VerificationCommandSchema).min(1),
  })
  .strict();

export const VerificationResultSchema = z
  .object({
    commandId: NonEmptyStringSchema,
    status: z.enum(VERIFICATION_STATUSES),
    exitCode: z.number().int().optional(),
    startedAt: TimestampSchema,
    endedAt: TimestampSchema,
    durationMs: z.number().nonnegative(),
    stdout: z.string(),
    stderr: z.string(),
    redacted: z.boolean(),
  })
  .strict();

export const ReviewFindingSchema = z
  .object({
    id: NonEmptyStringSchema,
    severity: z.enum(REVIEW_SEVERITIES),
    title: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    status: z.enum(REVIEW_STATUSES),
    file: NonEmptyStringSchema.optional(),
    line: z.number().int().positive().optional(),
    verificationCommandId: NonEmptyStringSchema.optional(),
  })
  .strict();

export const RequirementCoverageSchema = z
  .object({
    requirementId: NonEmptyStringSchema,
    criterion: NonEmptyStringSchema,
    status: z.enum(COVERAGE_STATUSES),
    evidence: z.array(NonEmptyStringSchema),
  })
  .strict()
  .superRefine((coverage, context) => {
    if (coverage.status !== 'missing' && coverage.evidence.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['evidence'],
        message: 'Covered and partial requirements must include at least one evidence item.',
      });
    }
  });

export const ImplementationResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(IMPLEMENTATION_RESULT_STATUSES),
    summary: NonEmptyStringSchema,
    changedPaths: z.array(NonEmptyStringSchema),
    testChanges: z.array(NonEmptyStringSchema),
    notes: z.array(NonEmptyStringSchema),
    failure: z
      .discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal(IMPLEMENTATION_FAILURE_KINDS[0]),
            exitCode: z.number().int(),
            durationMs: z.number().nonnegative(),
            diagnostic: NonEmptyStringSchema,
          })
          .strict(),
        z
          .object({
            kind: z.literal(IMPLEMENTATION_FAILURE_KINDS[1]),
            timedOut: z.literal(true),
            durationMs: z.number().nonnegative(),
            diagnostic: NonEmptyStringSchema,
            signal: NonEmptyStringSchema.optional(),
          })
          .strict(),
        z
          .object({
            kind: z.literal(IMPLEMENTATION_FAILURE_KINDS[2]),
            durationMs: z.number().nonnegative(),
            diagnostic: NonEmptyStringSchema,
          })
          .strict(),
        z
          .object({
            kind: z.literal(IMPLEMENTATION_FAILURE_KINDS[3]),
            signal: NonEmptyStringSchema,
            durationMs: z.number().nonnegative(),
            diagnostic: NonEmptyStringSchema,
          })
          .strict(),
        z
          .object({
            kind: z.literal(IMPLEMENTATION_FAILURE_KINDS[4]),
            diagnostic: NonEmptyStringSchema,
          })
          .strict(),
        z
          .object({
            kind: z.literal(IMPLEMENTATION_FAILURE_KINDS[5]),
            durationMs: z.number().nonnegative().optional(),
            diagnostic: NonEmptyStringSchema,
          })
          .strict(),
      ])
      .optional(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.status === 'completed' && result.failure !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['failure'],
        message: 'Completed implementation results cannot include failure evidence.',
      });
    }
  });

export const ReviewResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    summary: NonEmptyStringSchema,
    findings: z.array(ReviewFindingSchema),
    requirementCoverage: z.array(RequirementCoverageSchema).min(1),
    unresolvedFindingIds: z.array(NonEmptyStringSchema),
  })
  .strict()
  .superRefine((review, context) => {
    const findingsById = new Map(review.findings.map((finding) => [finding.id, finding]));
    const unresolvedFindingIds = new Set(review.unresolvedFindingIds);
    for (const findingId of review.unresolvedFindingIds) {
      const finding = findingsById.get(findingId);
      if (finding === undefined || finding.status !== 'open') {
        context.addIssue({
          code: 'custom',
          path: ['unresolvedFindingIds'],
          message: `Unresolved finding "${findingId}" must reference an open finding.`,
        });
      }
    }
    for (const finding of review.findings) {
      if (finding.status === 'open' && !unresolvedFindingIds.has(finding.id)) {
        context.addIssue({
          code: 'custom',
          path: ['unresolvedFindingIds'],
          message: `Open finding "${finding.id}" must be listed as unresolved.`,
        });
      }
    }
  });

export const RunSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: NonEmptyStringSchema,
    status: z.enum(SUMMARY_STATUSES),
    completedWork: z.array(NonEmptyStringSchema),
    verification: z.array(VerificationResultSchema),
    reviewFindings: z.array(ReviewFindingSchema),
    remainingRisks: z.array(NonEmptyStringSchema),
    pendingActions: z.array(NonEmptyStringSchema),
  })
  .strict();

export const TerminalFailureSchema = z
  .object({
    stage: NonEmptyStringSchema,
    code: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
    occurredAt: TimestampSchema,
    retryable: z.boolean(),
    artifact: NonEmptyStringSchema.optional(),
  })
  .strict();

export const RunIdSchema = z.string().regex(RUN_ID_PATTERN);
