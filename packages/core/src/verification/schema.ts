import { z } from 'zod';

import {
  RUN_ID_PATTERN,
  VerificationCommandSchema,
  VerificationResultSchema,
} from '../contracts/index.js';

export const VerificationRecordSchema = z
  .object({
    command: VerificationCommandSchema,
    result: VerificationResultSchema,
  })
  .strict();

export const VerificationReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().regex(RUN_ID_PATTERN),
    status: z.enum(['passed', 'failed']),
    records: z.array(VerificationRecordSchema),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
  })
  .strict();
