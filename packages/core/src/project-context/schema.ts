import { z } from 'zod';

import { VerificationCommandSchema } from '../contracts/index.js';
import {
  DEFAULT_VERIFICATION_TIMEOUT_MS,
  GIT_WORKTREE_STATUSES,
  PACKAGE_MANAGERS,
  VERIFICATION_COMMAND_KINDS,
} from './constant.js';

const NonEmptyStringSchema = z.string().trim().min(1);

export const VerificationCommandOverrideSchema = z
  .object({
    command: NonEmptyStringSchema,
    args: z.array(z.string()),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

export const VerificationSettingsSchema = z
  .object({
    requiredCommands: z
      .array(z.enum(VERIFICATION_COMMAND_KINDS))
      .min(1)
      .default([...VERIFICATION_COMMAND_KINDS]),
    defaultTimeoutMs: z.number().int().positive().default(DEFAULT_VERIFICATION_TIMEOUT_MS),
    commandOverrides: z
      .partialRecord(z.enum(VERIFICATION_COMMAND_KINDS), VerificationCommandOverrideSchema)
      .default({}),
  })
  .strict()
  .superRefine((settings, context) => {
    if (new Set(settings.requiredCommands).size !== settings.requiredCommands.length) {
      context.addIssue({
        code: 'custom',
        path: ['requiredCommands'],
        message: 'Required verification commands must be unique.',
      });
    }
  });

export const ProjectGitStatusSchema = z
  .object({
    isRepository: z.boolean(),
    branch: NonEmptyStringSchema.optional(),
    status: z.enum(GIT_WORKTREE_STATUSES),
    changedPaths: z.array(NonEmptyStringSchema),
  })
  .strict();

export const ProjectProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    repositoryRoot: NonEmptyStringSchema,
    git: ProjectGitStatusSchema,
    packageManager: z.enum(PACKAGE_MANAGERS),
    languages: z.array(NonEmptyStringSchema),
    frameworks: z.array(NonEmptyStringSchema),
    conventionFiles: z.array(NonEmptyStringSchema),
    planningContextFiles: z.array(NonEmptyStringSchema),
    testConfigFiles: z.array(NonEmptyStringSchema),
    packageScripts: z.record(z.string(), z.string()),
    verificationCommands: z.array(VerificationCommandSchema),
    ambiguities: z.array(NonEmptyStringSchema),
    requiresConfirmation: z.boolean(),
    confirmedByUser: z.boolean().default(false),
  })
  .strict();

export function createDefaultVerificationSettings() {
  return {
    requiredCommands: [...VERIFICATION_COMMAND_KINDS],
    defaultTimeoutMs: DEFAULT_VERIFICATION_TIMEOUT_MS,
    commandOverrides: {},
  };
}
