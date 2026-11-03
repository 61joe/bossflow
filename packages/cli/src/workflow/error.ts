import type { CLI_EXIT_CODES } from './constant.js';

export type CliExitCode = (typeof CLI_EXIT_CODES)[keyof typeof CLI_EXIT_CODES];

export class WorkflowCliError extends Error {
  readonly exitCode: CliExitCode;
  readonly recovery?: string | undefined;

  constructor(message: string, exitCode: CliExitCode, recovery?: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'WorkflowCliError';
    this.exitCode = exitCode;
    this.recovery = recovery;
  }
}
