import type { VerificationReport } from './types.js';

export function renderVerification(report: VerificationReport): string {
  const lines = [
    '# Verification',
    '',
    `- Run: ${report.runId}`,
    `- Status: ${report.status}`,
    `- Started: ${report.startedAt}`,
    `- Ended: ${report.endedAt}`,
    '',
    '## Commands',
  ];
  for (const record of report.records) {
    lines.push(
      '',
      `### ${record.command.label} (${record.command.id})`,
      '',
      `- Status: ${record.result.status}`,
      `- Exit code: ${record.result.exitCode ?? 'none'}`,
      `- Duration: ${record.result.durationMs} ms`,
    );
    if (record.result.stdout.length > 0) {
      lines.push('', '```text', record.result.stdout, '```');
    }
    if (record.result.stderr.length > 0) {
      lines.push('', '```text', record.result.stderr, '```');
    }
  }
  return `${lines.join('\n')}\n`;
}
