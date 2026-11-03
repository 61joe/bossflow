import type { VerificationCommand, VerificationResult } from '../contracts/index.js';
import type { RunStore } from '../run-store/index.js';
import type { WorkflowRun } from '../workflow/index.js';
export interface VerificationRecord {
  readonly command: VerificationCommand;
  readonly result: VerificationResult;
}

export interface VerificationReport {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly status: 'passed' | 'failed';
  readonly records: readonly VerificationRecord[];
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface CommandRunnerOptions {
  readonly maxOutputBytes?: number;
  readonly now?: () => Date;
  readonly environment?: NodeJS.ProcessEnv;
  readonly secrets?: readonly string[];
}

export interface VerificationCommandRunner {
  run(command: VerificationCommand, cwd: string, signal?: AbortSignal): Promise<VerificationResult>;
}

export type VerificationOutcome =
  | {
      readonly status: 'passed';
      readonly run: WorkflowRun;
      readonly report: VerificationReport;
    }
  | {
      readonly status: 'failed';
      readonly run: WorkflowRun;
      readonly report: VerificationReport;
      readonly failedCommandId: string;
    }
  | {
      readonly status: 'already-completed';
      readonly run: WorkflowRun;
      readonly report: VerificationReport;
    };

export interface VerificationCoordinatorOptions {
  readonly store: RunStore;
  readonly commandRunner?: VerificationCommandRunner;
  readonly now?: () => Date;
  readonly secrets?: readonly string[];
}

export interface VerifyWorkflowOptions {
  readonly runId: string;
  readonly signal?: AbortSignal | undefined;
}
