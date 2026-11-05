import { execa } from 'execa';

import type {
  ImplementationResult,
  WorktreeImplementer,
  WorktreeImplementerContext,
} from '@bossflow/core';
import { redactText } from '@bossflow/core';

import {
  CODEX_IMPLEMENTATION_TIMEOUT_MS,
  CODEX_MAX_FAILURE_DETAIL_CHARS,
  CODEX_MAX_OUTPUT_BYTES,
} from './constant.js';

export function createCodexWorktreeImplementer(): WorktreeImplementer {
  return async (context: WorktreeImplementerContext): Promise<ImplementationResult> => {
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
        return blockedResult(
          `Codex implementation exited with code ${result.exitCode ?? 'unknown'}.`,
          [result.stderr, result.stdout],
        );
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
      return blockedResult('Codex implementation could not be started.', [formatError(error)]);
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
  details: readonly (string | undefined)[],
): ImplementationResult {
  const note = redactText(
    details
      .filter((detail): detail is string => detail !== undefined && detail.trim().length > 0)
      .join('\n')
      .slice(0, CODEX_MAX_FAILURE_DETAIL_CHARS),
  );
  return {
    schemaVersion: 1,
    status: 'blocked',
    summary,
    changedPaths: [],
    testChanges: [],
    notes: [note.length === 0 ? 'No coding agent diagnostics were returned.' : note],
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
