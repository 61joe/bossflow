import type { ReviewResult, RunSummary } from '../contracts/index.js';

export function renderReview(review: ReviewResult): string {
  const lines = ['# Review', '', review.summary, '', '## Findings'];
  if (review.findings.length === 0) {
    lines.push('', 'No findings.');
  } else {
    for (const finding of review.findings) {
      lines.push(
        '',
        `### ${finding.severity}: ${finding.title}`,
        '',
        finding.description,
        '',
        `- Status: ${finding.status}`,
        ...(finding.file === undefined
          ? []
          : [`- Location: ${finding.file}${finding.line === undefined ? '' : `:${finding.line}`}`]),
      );
    }
  }
  lines.push('', '## Requirement Coverage');
  for (const coverage of review.requirementCoverage) {
    lines.push(
      '',
      `- ${coverage.status}: ${coverage.criterion}`,
      ...coverage.evidence.map((evidence) => `  - ${evidence}`),
    );
  }
  return `${lines.join('\n')}\n`;
}

export function renderSummary(summary: RunSummary): string {
  const lines = [
    '# Summary',
    '',
    `- Run: ${summary.runId}`,
    `- Status: ${summary.status}`,
    '',
    '## Completed Work',
    ...summary.completedWork.map((item) => `- ${item}`),
    '',
    '## Verification',
    ...summary.verification.map((result) => `- ${result.commandId}: ${result.status}`),
    '',
    '## Review Findings',
    ...summary.reviewFindings.map(
      (finding) => `- ${finding.severity} ${finding.status}: ${finding.title}`,
    ),
    '',
    '## Remaining Risks',
    ...(summary.remainingRisks.length === 0
      ? ['- None recorded.']
      : summary.remainingRisks.map((risk) => `- ${risk}`)),
    '',
    '## Pending Actions',
    ...(summary.pendingActions.length === 0
      ? ['- None.']
      : summary.pendingActions.map((action) => `- ${action}`)),
  ];
  return `${lines.join('\n')}\n`;
}
