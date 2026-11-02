import { z } from 'zod';

import {
  ApprovalRecordSchema,
  ArtifactReferenceSchema,
  RUN_ID_PATTERN,
  TerminalFailureSchema,
  WorktreeMetadataSchema,
} from '../contracts/index.js';
import { ProjectProfileSchema } from '../project-context/index.js';
import { INITIAL_WORKFLOW_REVISION, WORKFLOW_SCHEMA_VERSION, WORKFLOW_STAGES } from './constant.js';
import type { WorkflowRun } from './types.js';

const TimestampSchema = z.iso.datetime();
const NonEmptyStringSchema = z.string().trim().min(1);

export const WorkflowRunSchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_SCHEMA_VERSION),
    id: NonEmptyStringSchema.regex(RUN_ID_PATTERN),
    repositoryPath: NonEmptyStringSchema,
    goal: NonEmptyStringSchema,
    modelProfile: NonEmptyStringSchema,
    model: NonEmptyStringSchema.optional(),
    projectProfile: ProjectProfileSchema.optional(),
    stage: z.enum(WORKFLOW_STAGES),
    workflowRevision: z.number().int().positive().default(INITIAL_WORKFLOW_REVISION),
    approvals: z.array(ApprovalRecordSchema).default([]),
    worktree: WorktreeMetadataSchema.optional(),
    artifacts: z.array(ArtifactReferenceSchema).default([]),
    failure: TerminalFailureSchema.optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

export function parseWorkflowRun(value: unknown): WorkflowRun {
  return WorkflowRunSchema.parse(value);
}
