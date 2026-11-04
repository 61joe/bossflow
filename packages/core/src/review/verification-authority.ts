import type { ReviewResult, VerificationCommand } from '../contracts/index.js';
import type { ReviewerVerificationContext } from '../agents/index.js';
import type { DeriveReviewerVerificationContextOptions } from './types.js';

export function deriveReviewerVerificationContext(
  options: DeriveReviewerVerificationContextOptions,
): ReviewerVerificationContext {
  const executedCommandIds = [
    ...new Set(options.verificationRecords.map((record) => record.command.id)),
  ];
  const missingRequiredCommandIds = options.authoritativeCommands
    .filter(
      (command) =>
        command.required &&
        !options.verificationRecords.some((record) => commandsMatch(command, record.command)),
    )
    .map((command) => command.id);
  const advisoryPlanCommands = options.planCommands.filter(
    (command) =>
      !options.authoritativeCommands.some((authoritativeCommand) =>
        commandsMatch(command, authoritativeCommand),
      ),
  );

  return {
    authoritativeCommands: options.authoritativeCommands,
    executedCommandIds,
    advisoryPlanCommands,
    missingRequiredCommandIds,
  };
}

export function enforceVerificationAuthority(
  review: ReviewResult,
  context: ReviewerVerificationContext,
): ReviewResult {
  const advisoryCommandIds = new Set(context.advisoryPlanCommands.map((command) => command.id));
  const missingRequiredCommandIds = new Set(context.missingRequiredCommandIds);
  const findings = review.findings.map((finding) =>
    downgradeAdvisoryFinding(finding, advisoryCommandIds),
  );
  const findingsWithModelBlockers = new Set(
    findings
      .filter(
        (finding) =>
          finding.verificationCommandId !== undefined &&
          missingRequiredCommandIds.has(finding.verificationCommandId) &&
          finding.status === 'open' &&
          (finding.severity === 'P0' || finding.severity === 'P1'),
      )
      .map((finding) => finding.verificationCommandId),
  );
  const usedIds = new Set(findings.map((finding) => finding.id));
  const missingRequiredFindings = context.missingRequiredCommandIds
    .filter((commandId) => !findingsWithModelBlockers.has(commandId))
    .map((commandId) => createMissingVerificationFinding(commandId, usedIds));
  const findingsChanged = findings.some((finding, index) => finding !== review.findings[index]);
  if (!findingsChanged && missingRequiredFindings.length === 0) {
    return review;
  }

  return {
    ...review,
    findings: [...findings, ...missingRequiredFindings],
    unresolvedFindingIds: [
      ...review.unresolvedFindingIds,
      ...missingRequiredFindings.map((finding) => finding.id),
    ],
  };
}

function downgradeAdvisoryFinding(
  finding: ReviewResult['findings'][number],
  advisoryCommandIds: ReadonlySet<string>,
): ReviewResult['findings'][number] {
  if (
    finding.verificationCommandId === undefined ||
    !advisoryCommandIds.has(finding.verificationCommandId) ||
    (finding.severity !== 'P0' && finding.severity !== 'P1')
  ) {
    return finding;
  }
  return {
    ...finding,
    severity: 'P3',
  };
}

function createMissingVerificationFinding(
  commandId: string,
  usedIds: Set<string>,
): ReviewResult['findings'][number] {
  return {
    id: nextFindingId(usedIds),
    severity: 'P1',
    title: 'Required verification evidence is missing',
    description: `Authoritative required command "${commandId}" has no recorded verification evidence.`,
    status: 'open',
    verificationCommandId: commandId,
  };
}

function commandsMatch(left: VerificationCommand, right: VerificationCommand): boolean {
  return (
    left.id === right.id &&
    left.command === right.command &&
    argumentsMatch(left.args, right.args) &&
    (left.cwd ?? '') === (right.cwd ?? '')
  );
}

function argumentsMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((argument, index) => argument === right[index]);
}

function nextFindingId(usedIds: Set<string>): string {
  let index = 1;
  while (usedIds.has(`missing-verification-${index}`)) {
    index += 1;
  }
  const id = `missing-verification-${index}`;
  usedIds.add(id);
  return id;
}
