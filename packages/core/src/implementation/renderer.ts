import type { PersistedImplementationRecord } from './types.js';

export function renderImplementation(record: PersistedImplementationRecord): string {
  const { result } = record;
  const lines = [
    '# Implementation',
    '',
    `- Run: ${record.runId}`,
    `- Status: ${result.status}`,
    `- Base commit: ${record.baseCommit}`,
    `- Changed paths: ${record.changedPaths.length}`,
    ...(record.changedPaths.length === 0
      ? []
      : record.changedPaths.map((changedPath) => `  - ${changedPath}`)),
    '',
    '## Summary',
    '',
    result.summary,
  ];

  if (result.failure !== undefined) {
    const { failure } = result;
    lines.push(
      '',
      '## Failure',
      '',
      `- Kind: ${failure.kind}`,
      ...('exitCode' in failure ? [`- Exit code: ${failure.exitCode}`] : []),
      ...('signal' in failure && failure.signal !== undefined
        ? [`- Signal: ${failure.signal}`]
        : []),
      ...('timedOut' in failure ? [`- Timed out: ${failure.timedOut}`] : []),
      ...('durationMs' in failure && failure.durationMs !== undefined
        ? [`- Duration: ${failure.durationMs} ms`]
        : []),
      '',
      '### Diagnostics',
      '',
      '```text',
      failure.diagnostic,
      '```',
    );
  }

  lines.push('', '## Test Changes');
  lines.push(
    ...(result.testChanges.length === 0
      ? ['- None recorded.']
      : result.testChanges.map((change) => `- ${change}`)),
    '',
    '## Notes',
  );
  lines.push(
    ...(result.notes.length === 0 ? ['- None recorded.'] : result.notes.map((note) => `- ${note}`)),
  );
  return `${lines.join('\n')}\n`;
}
