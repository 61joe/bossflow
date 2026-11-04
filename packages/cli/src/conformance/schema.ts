import { z } from 'zod';

import type { ConformanceReport } from './types.js';

const NonEmptyStringSchema = z.string().trim().min(1);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const ConformanceReportSchema: z.ZodType<ConformanceReport> = z
  .object({
    schemaVersion: z.literal(1),
    adapterId: z.literal('codex'),
    scenarioId: z.enum(['single-js-export', 'single-js-function', 'multi-package-js-export']),
    projectProfile: z
      .object({
        id: z.enum(['single-package-javascript', 'multi-package-javascript']),
        packageManager: z.enum(['pnpm', 'npm', 'yarn', 'bun', 'unknown']),
        languages: z.array(NonEmptyStringSchema),
      })
      .strict(),
    runId: NonEmptyStringSchema,
    stage: z.enum([
      'spec',
      'plan',
      'plan_approval',
      'build',
      'verify',
      'review',
      'review_approval',
      'completed',
      'blocked',
      'failed',
    ]),
    outcome: z.enum(['completed', 'blocked', 'failed']),
    firstIncompleteStage: z
      .enum([
        'spec',
        'plan',
        'plan_approval',
        'build',
        'verify',
        'review',
        'review_approval',
        'completed',
        'blocked',
        'failed',
      ])
      .optional(),
    changedPaths: z.array(NonEmptyStringSchema),
    verification: z.array(
      z
        .object({
          commandId: NonEmptyStringSchema,
          status: z.enum(['passed', 'failed', 'skipped']),
          exitCode: z.number().int().optional(),
        })
        .strict(),
    ),
    reviewFindings: z.array(
      z
        .object({
          id: NonEmptyStringSchema,
          severity: z.enum(['P0', 'P1', 'P2', 'P3']),
          title: NonEmptyStringSchema,
          status: z.enum(['open', 'resolved', 'waived']),
          verificationCommandId: NonEmptyStringSchema.optional(),
        })
        .strict(),
    ),
    userInterventions: z.array(NonEmptyStringSchema),
    authorizedExternalActions: z.array(z.enum(['commit', 'push', 'merge', 'pr'])),
    artifactHashes: z.record(NonEmptyStringSchema, Sha256Schema),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    failureMessage: NonEmptyStringSchema.optional(),
  })
  .strict();
