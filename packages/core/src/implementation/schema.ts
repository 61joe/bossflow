import { z } from 'zod';

import { ImplementationResultSchema, RUN_ID_PATTERN } from '../contracts/index.js';

const NonEmptyStringSchema = z.string().trim().min(1);

export const PersistedImplementationRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().regex(RUN_ID_PATTERN),
    result: ImplementationResultSchema,
    baseCommit: NonEmptyStringSchema,
    changedPaths: z.array(NonEmptyStringSchema),
    sensitivePaths: z.array(NonEmptyStringSchema),
    unexpectedPaths: z.array(NonEmptyStringSchema),
    patchFileName: NonEmptyStringSchema.optional(),
    patchSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
