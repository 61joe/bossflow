import type {
  ReviewResult,
  VerificationCommand,
  VerificationResult,
} from '../../contracts/index.js';
import type { VerificationRecord } from '../../verification/index.js';
import { deriveReviewerVerificationContext, enforceVerificationAuthority } from '../index.js';

const TEST_COMMAND: VerificationCommand = {
  id: 'test',
  label: 'Test',
  command: 'pnpm',
  args: ['test'],
  required: true,
  timeoutMs: 1_000,
};

const LINT_COMMAND: VerificationCommand = {
  id: 'lint',
  label: 'Lint',
  command: 'pnpm',
  args: ['lint'],
  required: true,
  timeoutMs: 1_000,
};

const OPTIONAL_BUILD_COMMAND: VerificationCommand = {
  id: 'build',
  label: 'Build',
  command: 'pnpm',
  args: ['build'],
  required: false,
  timeoutMs: 1_000,
};
const ADVISORY_COMMAND: VerificationCommand = {
  id: 'diff-check',
  label: 'Diff check',
  command: 'git',
  args: ['diff', '--check'],
  required: true,
  timeoutMs: 1_000,
};

describe('deriveReviewerVerificationContext', () => {
  it('matches executed commands by id, command, arguments, and cwd', () => {
    const context = deriveReviewerVerificationContext({
      authoritativeCommands: [TEST_COMMAND],
      planCommands: [TEST_COMMAND],
      verificationRecords: [verificationRecord(TEST_COMMAND)],
    });

    expect(context).toEqual({
      authoritativeCommands: [TEST_COMMAND],
      executedCommandIds: ['test'],
      advisoryPlanCommands: [],
      missingRequiredCommandIds: [],
    });
  });

  it('treats any changed plan command as advisory', () => {
    const changedId = { ...TEST_COMMAND, command: 'npm' };
    const changedExecutable = { ...TEST_COMMAND, command: 'node' };
    const changedArguments = { ...TEST_COMMAND, args: ['test:unit'] };
    const changedArgumentCount = { ...TEST_COMMAND, args: [] };
    const changedCwd = { ...TEST_COMMAND, cwd: 'packages/core' };
    const context = deriveReviewerVerificationContext({
      authoritativeCommands: [TEST_COMMAND],
      planCommands: [
        changedId,
        changedExecutable,
        changedArguments,
        changedArgumentCount,
        changedCwd,
      ],
      verificationRecords: [verificationRecord(TEST_COMMAND)],
    });

    expect(context.advisoryPlanCommands).toEqual([
      changedId,
      changedExecutable,
      changedArguments,
      changedArgumentCount,
      changedCwd,
    ]);
    expect(context.missingRequiredCommandIds).toEqual([]);
  });

  it('reports only missing required authoritative commands', () => {
    const context = deriveReviewerVerificationContext({
      authoritativeCommands: [TEST_COMMAND, LINT_COMMAND, OPTIONAL_BUILD_COMMAND],
      planCommands: [],
      verificationRecords: [verificationRecord(TEST_COMMAND)],
    });

    expect(context.executedCommandIds).toEqual(['test']);
    expect(context.missingRequiredCommandIds).toEqual(['lint']);
  });

  it('does not classify an unexecuted authoritative plan command as advisory', () => {
    const context = deriveReviewerVerificationContext({
      authoritativeCommands: [TEST_COMMAND],
      planCommands: [TEST_COMMAND],
      verificationRecords: [],
    });

    expect(context.advisoryPlanCommands).toEqual([]);
    expect(context.missingRequiredCommandIds).toEqual(['test']);
  });
});

describe('enforceVerificationAuthority', () => {
  it('returns the review unchanged when required evidence is complete', () => {
    const review = reviewResult();
    const context = deriveReviewerVerificationContext({
      authoritativeCommands: [TEST_COMMAND],
      planCommands: [TEST_COMMAND],
      verificationRecords: [verificationRecord(TEST_COMMAND)],
    });

    expect(enforceVerificationAuthority(review, context)).toBe(review);
  });

  it('downgrades command-specific findings for advisory checks', () => {
    const review = reviewWithFindings([
      commandFinding('advisory-p1', 'P1', 'diff-check'),
      commandFinding('authoritative-p1', 'P1', 'test'),
      commandFinding('advisory-p2', 'P2', 'diff-check'),
      {
        id: 'generic-p1',
        severity: 'P1',
        title: 'Generic finding',
        description: 'Not tied to a verification command.',
        status: 'open',
      },
    ]);
    const context = deriveReviewerVerificationContext({
      authoritativeCommands: [TEST_COMMAND],
      planCommands: [TEST_COMMAND, ADVISORY_COMMAND],
      verificationRecords: [verificationRecord(TEST_COMMAND)],
    });

    const enforced = enforceVerificationAuthority(review, context);

    expect(enforced.findings).toEqual([
      expect.objectContaining({ id: 'advisory-p1', severity: 'P3' }),
      expect.objectContaining({ id: 'authoritative-p1', severity: 'P1' }),
      expect.objectContaining({ id: 'advisory-p2', severity: 'P2' }),
      expect.objectContaining({ id: 'generic-p1', severity: 'P1' }),
    ]);
    expect(enforced.unresolvedFindingIds).toEqual(review.unresolvedFindingIds);
  });

  it('does not duplicate a model blocker for missing required evidence', () => {
    const review = reviewWithFindings([commandFinding('model-missing-lint', 'P1', 'lint')]);
    const context = deriveReviewerVerificationContext({
      authoritativeCommands: [LINT_COMMAND],
      planCommands: [],
      verificationRecords: [],
    });

    expect(enforceVerificationAuthority(review, context)).toBe(review);
  });

  it('adds unique blocking findings for missing required evidence', () => {
    const review = reviewResult('missing-verification-1');
    const context = deriveReviewerVerificationContext({
      authoritativeCommands: [LINT_COMMAND, TEST_COMMAND],
      planCommands: [],
      verificationRecords: [],
    });

    const enforced = enforceVerificationAuthority(review, context);

    expect(enforced.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'missing-verification-2',
          severity: 'P1',
          title: 'Required verification evidence is missing',
        }),
        expect.objectContaining({
          id: 'missing-verification-3',
          severity: 'P1',
        }),
      ]),
    );
    expect(enforced.unresolvedFindingIds).toEqual([
      'missing-verification-1',
      'missing-verification-2',
      'missing-verification-3',
    ]);
  });
});

function verificationRecord(command: VerificationCommand): VerificationRecord {
  const result: VerificationResult = {
    commandId: command.id,
    status: 'passed',
    exitCode: 0,
    startedAt: '2026-11-04T00:00:00.000Z',
    endedAt: '2026-11-04T00:00:00.000Z',
    durationMs: 0,
    stdout: '',
    stderr: '',
    redacted: true,
  };
  return { command, result };
}

function reviewResult(existingFindingId?: string): ReviewResult {
  const findings =
    existingFindingId === undefined
      ? []
      : [
          {
            id: existingFindingId,
            severity: 'P2' as const,
            title: 'Existing finding',
            description: 'Existing finding.',
            status: 'open' as const,
          },
        ];
  return {
    schemaVersion: 1,
    summary: 'Reviewed.',
    findings,
    requirementCoverage: [
      {
        requirementId: 'acceptance-1',
        criterion: 'Tests pass.',
        status: 'covered',
        evidence: ['test passed'],
      },
    ],
    unresolvedFindingIds: findings.map((finding) => finding.id),
  };
}

function reviewWithFindings(findings: ReviewResult['findings']): ReviewResult {
  return {
    ...reviewResult(),
    findings,
    unresolvedFindingIds: findings.map((finding) => finding.id),
  };
}

function commandFinding(
  id: string,
  severity: 'P0' | 'P1' | 'P2' | 'P3',
  verificationCommandId: string,
): ReviewResult['findings'][number] {
  return {
    id,
    severity,
    title: `Finding ${id}`,
    description: `Finding ${id}.`,
    status: 'open',
    verificationCommandId,
  };
}
