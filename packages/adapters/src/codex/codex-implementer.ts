import { execa } from 'execa';

import type {
  ImplementationFailureEvidence,
  ImplementationResult,
  WorktreeImplementer,
  WorktreeImplementerContext,
} from '@bossflow/core';
import { redactText } from '@bossflow/core';

import {
  CODEX_IMPLEMENTATION_TIMEOUT_MS,
  CODEX_MAX_FAILURE_DIAGNOSTIC_BYTES,
  CODEX_MAX_OUTPUT_BYTES,
} from './constant.js';

export function createCodexWorktreeImplementer(): WorktreeImplementer {
  return async (context: WorktreeImplementerContext): Promise<ImplementationResult> => {
    const startedAt = performance.now();
    try {
      const result = await execa(
        'codex',
        [
          'exec',
          '--ephemeral',
          '--sandbox',
          'workspace-write',
          '--color',
          'never',
          '--cd',
          context.worktreePath,
          buildImplementationPrompt(context),
        ],
        {
          cwd: context.worktreePath,
          stdin: 'ignore',
          reject: false,
          timeout: CODEX_IMPLEMENTATION_TIMEOUT_MS,
          maxBuffer: CODEX_MAX_OUTPUT_BYTES,
          ...(context.signal === undefined ? {} : { cancelSignal: context.signal }),
        },
      );
      if (result.exitCode !== 0) {
        const failure = classifyProcessFailure(result, context.signal, startedAt);
        return blockedResult(summaryForFailure(failure), failure);
      }
      return {
        schemaVersion: 1,
        status: 'completed',
        summary: 'Codex completed implementation in the isolated worktree.',
        changedPaths: [],
        testChanges: [],
        notes: ['Implementation changes were collected from the isolated Git worktree.'],
      };
    } catch (error: unknown) {
      const durationMs = Math.max(0, performance.now() - startedAt);
      const diagnostic = boundDiagnostic(redactText(formatError(error)));
      const failure: ImplementationFailureEvidence = context.signal?.aborted
        ? { kind: 'canceled', durationMs, diagnostic }
        : { kind: 'spawn-error', diagnostic };
      return blockedResult(summaryForFailure(failure), failure);
    }
  };
}

function buildImplementationPrompt(context: WorktreeImplementerContext): string {
  return [
    'Implement the approved BossFlow technical plan in this isolated worktree.',
    'Modify only the approved paths. Add or update tests when needed.',
    'Do not commit, push, merge, create a pull request, alter approval records, or edit files outside the approved scope.',
    'Run focused checks when useful, but BossFlow will run the complete verification suite afterward.',
    'Approved paths:',
    ...context.approvedPaths.map((approvedPath) => `- ${approvedPath}`),
    'Technical plan:',
    JSON.stringify(context.plan, null, 2),
  ].join('\n');
}

function blockedResult(
  summary: string,
  failure: ImplementationFailureEvidence,
): ImplementationResult {
  return {
    schemaVersion: 1,
    status: 'blocked',
    summary,
    changedPaths: [],
    testChanges: [],
    notes: [failure.diagnostic],
    failure,
  };
}

interface CodexProcessResult {
  readonly exitCode?: number | undefined;
  readonly stdout?: string | undefined;
  readonly stderr?: string | undefined;
  readonly signal?: string | undefined;
  readonly timedOut?: boolean | undefined;
  readonly isCanceled?: boolean | undefined;
  readonly durationMs?: number | undefined;
}

function classifyProcessFailure(
  result: CodexProcessResult,
  signal: AbortSignal | undefined,
  startedAt: number,
): ImplementationFailureEvidence {
  const durationMs = Math.max(0, result.durationMs ?? performance.now() - startedAt);
  const diagnostic = createDiagnostic(result);
  if (result.timedOut === true) {
    return {
      kind: 'timeout',
      timedOut: true,
      durationMs,
      diagnostic,
      ...(isNonEmpty(result.signal) ? { signal: result.signal } : {}),
    };
  }
  if (result.isCanceled === true || signal?.aborted === true) {
    return { kind: 'canceled', durationMs, diagnostic };
  }
  if (isNonEmpty(result.signal)) {
    return { kind: 'signaled', signal: result.signal, durationMs, diagnostic };
  }
  if (typeof result.exitCode === 'number') {
    return { kind: 'nonzero-exit', exitCode: result.exitCode, durationMs, diagnostic };
  }
  return { kind: 'unknown', durationMs, diagnostic };
}

function createDiagnostic(result: CodexProcessResult): string {
  const diagnostic = [
    ...(isNonEmpty(result.stderr) ? [`[stderr]\n${result.stderr}`] : []),
    ...(isNonEmpty(result.stdout) ? [`[stdout]\n${result.stdout}`] : []),
  ].join('\n');
  return boundDiagnostic(
    redactText(diagnostic.length === 0 ? 'No coding agent diagnostics were returned.' : diagnostic),
  );
}

function boundDiagnostic(value: string): string {
  const bytes = Buffer.from(value);
  if (bytes.length <= CODEX_MAX_FAILURE_DIAGNOSTIC_BYTES) {
    return value;
  }
  const marker = `\n[DIAGNOSTIC_MIDDLE_OMITTED bytes=${bytes.length - CODEX_MAX_FAILURE_DIAGNOSTIC_BYTES}]\n`;
  const contentBudget = Math.max(0, CODEX_MAX_FAILURE_DIAGNOSTIC_BYTES - Buffer.byteLength(marker));
  const headBudget = Math.ceil(contentBudget / 2);
  const tailBudget = contentBudget - headBudget;
  const head = bytes
    .subarray(0, headBudget)
    .toString('utf8')
    .replace(/\uFFFD+$/u, '');
  const tail = bytes
    .subarray(bytes.length - tailBudget)
    .toString('utf8')
    .replace(/^\uFFFD+/u, '');
  return `${head}${marker}${tail}`;
}

function summaryForFailure(failure: ImplementationFailureEvidence): string {
  switch (failure.kind) {
    case 'nonzero-exit':
      return `Codex implementation exited with code ${failure.exitCode}.`;
    case 'timeout':
      return `Codex implementation timed out after ${failure.durationMs} ms.`;
    case 'canceled':
      return 'Codex implementation was canceled.';
    case 'signaled':
      return `Codex implementation was terminated by signal ${failure.signal}.`;
    case 'spawn-error':
      return 'Codex implementation could not be started.';
    case 'unknown':
      return 'Codex implementation returned an unknown process outcome.';
  }
}

function isNonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
