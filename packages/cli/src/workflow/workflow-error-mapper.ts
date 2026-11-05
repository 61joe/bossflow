import { RetryError } from '@bossflow/core';

import { CLI_EXIT_CODES } from './constant.js';
import { WorkflowCliError } from './error.js';
import type { CliExitCode } from './error.js';

export function mapRetryError(error: unknown): unknown {
  if (!(error instanceof RetryError)) {
    return error;
  }
  let exitCode: CliExitCode = CLI_EXIT_CODES.USAGE_ERROR;
  switch (error.code) {
    case 'approval-required':
      exitCode = CLI_EXIT_CODES.APPROVAL_REQUIRED;
      break;
    case 'blocked':
      exitCode = CLI_EXIT_CODES.BLOCKED;
      break;
    case 'missing-artifact':
      exitCode = CLI_EXIT_CODES.MISSING_ARTIFACT;
      break;
    case 'failed':
      exitCode = CLI_EXIT_CODES.FAILED;
      break;
  }
  return new WorkflowCliError(error.message, exitCode);
}

export function isMissingRunError(error: unknown): boolean {
  return (
    (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') ||
    (error instanceof Error && error.message.startsWith('Invalid run ID:'))
  );
}
