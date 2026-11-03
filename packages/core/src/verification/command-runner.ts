import { execa } from 'execa';

import type { VerificationCommand, VerificationResult } from '../contracts/index.js';
import { redactError, redactText } from '../redaction/index.js';
import type { SecretRedactionOptions } from '../redaction/index.js';
import { DEFAULT_MAX_COMMAND_OUTPUT_BYTES, SECRET_ENVIRONMENT_NAME_PATTERN } from './constant.js';
import type { CommandRunnerOptions, VerificationCommandRunner } from './types.js';

export class CommandRunner implements VerificationCommandRunner {
  readonly #maxOutputBytes: number;
  readonly #now: () => Date;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #secrets: readonly string[];

  constructor(options: CommandRunnerOptions = {}) {
    this.#maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_COMMAND_OUTPUT_BYTES;
    this.#now = options.now ?? (() => new Date());
    this.#environment = options.environment ?? process.env;
    this.#secrets = options.secrets ?? [];
  }

  async run(
    command: VerificationCommand,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<VerificationResult> {
    const started = this.#now();
    const startedAt = started.toISOString();
    try {
      const result = await execa(command.command, [...command.args], {
        cwd,
        reject: false,
        timeout: command.timeoutMs,
        maxBuffer: this.#maxOutputBytes,
        stripFinalNewline: false,
        ...(signal === undefined ? {} : { cancelSignal: signal }),
      });
      const diagnostic = getProcessDiagnostic(result);
      const stdout = boundOutput(result.stdout ?? '', diagnostic, this.#maxOutputBytes);
      const stderr = boundOutput(result.stderr ?? '', diagnostic, this.#maxOutputBytes);
      const redactionOptions = this.#getRedactionOptions();
      const redactedStdout = redactText(stdout, redactionOptions);
      const redactedStderr = redactText(stderr, redactionOptions);
      const ended = this.#now();
      return {
        commandId: command.id,
        status: result.exitCode === 0 ? 'passed' : 'failed',
        ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
        startedAt,
        endedAt: ended.toISOString(),
        durationMs: Math.max(0, ended.getTime() - started.getTime()),
        stdout: redactedStdout,
        stderr: redactedStderr,
        redacted: true,
      };
    } catch (error: unknown) {
      const ended = this.#now();
      const redactedError = redactError(error);
      const redactionOptions = this.#getRedactionOptions();
      return {
        commandId: command.id,
        status: 'failed',
        ...(getErrorExitCode(error) === undefined
          ? {}
          : { exitCode: getErrorExitCode(error) as number }),
        startedAt,
        endedAt: ended.toISOString(),
        durationMs: Math.max(0, ended.getTime() - started.getTime()),
        stdout: redactText(getErrorOutput(error, 'stdout'), redactionOptions),
        stderr: redactText(
          [getErrorOutput(error, 'stderr'), redactedError.message]
            .filter((entry) => entry.length > 0)
            .join('\n'),
          redactionOptions,
        ),
        redacted: true,
      };
    }
  }

  #getRedactionOptions(): SecretRedactionOptions {
    const secrets = new Set(this.#secrets);
    for (const [name, value] of Object.entries(this.#environment)) {
      if (value !== undefined && SECRET_ENVIRONMENT_NAME_PATTERN.test(name)) {
        secrets.add(value);
      }
    }
    return { secrets: [...secrets] };
  }
}

function getProcessDiagnostic(result: {
  readonly timedOut?: boolean;
  readonly isCanceled?: boolean;
  readonly isMaxBuffer?: boolean;
  readonly failed?: boolean;
}): string {
  if (result.timedOut === true) {
    return '[COMMAND_TIMED_OUT]';
  }
  if (result.isCanceled === true) {
    return '[COMMAND_CANCELED]';
  }
  if (result.isMaxBuffer === true) {
    return '[COMMAND_OUTPUT_LIMIT_REACHED]';
  }
  if (result.failed === true) {
    return '[COMMAND_FAILED]';
  }
  return '';
}

function boundOutput(output: string, diagnostic: string, maxBytes: number): string {
  const combined = [output, diagnostic].filter((entry) => entry.length > 0).join('\n');
  if (Buffer.byteLength(combined) <= maxBytes) {
    return combined;
  }
  const suffix = '\n[OUTPUT_TRUNCATED]';
  const available = Math.max(0, maxBytes - Buffer.byteLength(suffix));
  return `${Buffer.from(combined).subarray(0, available).toString('utf8')}${suffix}`;
}

export function getErrorOutput(error: unknown, key: 'stdout' | 'stderr'): string {
  if (typeof error !== 'object' || error === null || !(key in error)) {
    return '';
  }
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export function getErrorExitCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('exitCode' in error)) {
    return undefined;
  }
  return typeof error.exitCode === 'number' ? error.exitCode : undefined;
}
