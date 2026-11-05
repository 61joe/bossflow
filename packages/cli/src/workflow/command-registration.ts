import { APPROVAL_ACTIONS } from '@bossflow/core';
import { InvalidArgumentError } from 'commander';
import type { Command } from 'commander';
import type { ApprovalAction } from '@bossflow/core';

import type { ApproveCommandOptions, RetryCommandOptions, RunCommandOptions } from '../types.js';
import {
  executeApprove,
  executeResume,
  executeRetry,
  executeRun,
  executeStatus,
} from './command-handler.js';

export function registerWorkflowCommands(program: Command): void {
  program
    .command('run')
    .description(
      'Create a run, generate its specification and technical plan, and stop at approval.',
    )
    .argument('<goal>', 'development goal')
    .option('--profile <profile>', 'model profile from .bossflow/config.yaml')
    .option('--model <model>', 'override the model identifier for this run')
    .option('--confirm-project', 'accept inferred project verification commands')
    .option(
      '--stop-after <stage>',
      'stop after spec to preserve specification-only execution',
      parseStopAfter,
    )
    .action(async (goal: string, options: RunCommandOptions) => {
      await executeRun(process.cwd(), goal, options);
    });

  program
    .command('status')
    .description('Inspect a persisted workflow run.')
    .argument('<run-id>', 'run identifier')
    .action(async (runId: string) => {
      await executeStatus(process.cwd(), runId);
    });

  program
    .command('approve')
    .description('Approve a workflow gate.')
    .argument('<run-id>', 'run identifier')
    .requiredOption('--gate <gate>', 'approval gate: plan or review', parseApprovalGate)
    .option(
      '--action <action>',
      'external action to authorize; repeat for multiple actions',
      collectApprovalAction,
      [],
    )
    .option(
      '--verification <id>',
      'Plan verification command to adopt; repeat for multiple commands',
      collectVerificationId,
      [],
    )
    .option('--actor <actor>', 'approval actor')
    .option('--note <note>', 'approval note')
    .action(async (runId: string, options: ApproveCommandOptions) => {
      await executeApprove(process.cwd(), runId, options);
    });

  program
    .command('resume')
    .description('Resume a run from its first incomplete stage without bypassing gates.')
    .argument('<run-id>', 'run identifier')
    .action(async (runId: string) => {
      await executeResume(process.cwd(), runId);
    });

  program
    .command('retry')
    .description('Retry a blocked or failed run from Build or Verify.')
    .argument('<run-id>', 'run identifier')
    .requiredOption('--from <stage>', 'retry origin: build or verify', parseRetryOrigin)
    .option(
      '--verification <id>',
      'Plan verification command to adopt; repeat for multiple commands',
      collectVerificationId,
      [],
    )
    .action(async (runId: string, options: RetryCommandOptions) => {
      await executeRetry(process.cwd(), runId, options);
    });
}

function parseStopAfter(value: string): 'spec' {
  if (value === 'spec') {
    return value;
  }
  throw new InvalidArgumentError('--stop-after currently supports only "spec".');
}

function parseApprovalGate(value: string): 'plan' | 'review' {
  if (value === 'plan' || value === 'review') {
    return value;
  }
  throw new InvalidArgumentError('Approval gate must be "plan" or "review".');
}

function parseRetryOrigin(value: string): 'build' | 'verify' {
  if (value === 'build' || value === 'verify') {
    return value;
  }
  throw new InvalidArgumentError('Retry origin must be "build" or "verify".');
}

function collectApprovalAction(
  value: string,
  previous: readonly ApprovalAction[],
): ApprovalAction[] {
  if (!APPROVAL_ACTIONS.includes(value as ApprovalAction)) {
    throw new InvalidArgumentError(
      `Approval action must be one of: ${APPROVAL_ACTIONS.join(', ')}.`,
    );
  }
  return [...previous, value as ApprovalAction];
}

function collectVerificationId(value: string, previous: readonly string[]): string[] {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new InvalidArgumentError('Verification command ID must not be empty.');
  }
  return [...previous, normalized];
}
