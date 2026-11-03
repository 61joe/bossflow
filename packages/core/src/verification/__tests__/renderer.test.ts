import { renderVerification } from '../index.js';

describe('renderVerification', () => {
  it('renders stdout, stderr, and missing exit codes', () => {
    const markdown = renderVerification({
      schemaVersion: 1,
      runId: 'run-1',
      status: 'failed',
      startedAt: '2026-11-03T00:00:00.000Z',
      endedAt: '2026-11-03T00:00:01.000Z',
      records: [
        {
          command: {
            id: 'test',
            label: 'Test',
            command: 'node',
            args: [],
            required: true,
            timeoutMs: 1_000,
          },
          result: {
            commandId: 'test',
            status: 'failed',
            startedAt: '2026-11-03T00:00:00.000Z',
            endedAt: '2026-11-03T00:00:01.000Z',
            durationMs: 1_000,
            stdout: 'stdout text',
            stderr: 'stderr text',
            redacted: true,
          },
        },
      ],
    });

    expect(markdown).toContain('- Exit code: none');
    expect(markdown).toContain('stdout text');
    expect(markdown).toContain('stderr text');
  });
});
