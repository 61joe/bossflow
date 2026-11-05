import { renderImplementation } from '../renderer.js';

const BASE_RECORD = {
  schemaVersion: 1 as const,
  runId: 'run-1',
  baseCommit: 'a'.repeat(40),
  changedPaths: ['src/index.ts'],
  sensitivePaths: [],
  unexpectedPaths: [],
};

describe('renderImplementation', () => {
  it('renders a completed implementation with test changes and notes', () => {
    const markdown = renderImplementation({
      ...BASE_RECORD,
      result: {
        schemaVersion: 1,
        status: 'completed',
        summary: 'Implemented the change.',
        changedPaths: ['src/index.ts'],
        testChanges: ['Added a regression test.'],
        notes: ['Focused tests passed.'],
      },
    });
    expect(markdown).toContain('- Status: completed');
    expect(markdown).toContain('  - src/index.ts');
    expect(markdown).toContain('Implemented the change.');
    expect(markdown).toContain('- Added a regression test.');
    expect(markdown).toContain('- Focused tests passed.');
  });

  it('renders every failure field and diagnostics', () => {
    const markdown = renderImplementation({
      ...BASE_RECORD,
      result: {
        schemaVersion: 1,
        status: 'blocked',
        summary: 'Implementation timed out.',
        changedPaths: ['src/index.ts'],
        testChanges: [],
        notes: [],
        failure: {
          kind: 'timeout',
          timedOut: true,
          durationMs: 1200,
          diagnostic: '[DIAGNOSTIC_MIDDLE_OMITTED]',
          signal: 'SIGTERM',
        },
      },
    });

    expect(markdown).toContain('- Kind: timeout');
    expect(markdown).toContain('- Signal: SIGTERM');
    expect(markdown).toContain('- Timed out: true');
    expect(markdown).toContain('- Duration: 1200 ms');
    expect(markdown).toContain('[DIAGNOSTIC_MIDDLE_OMITTED]');
  });

  it('renders exit codes and empty lists', () => {
    const markdown = renderImplementation({
      ...BASE_RECORD,
      changedPaths: [],
      result: {
        schemaVersion: 1,
        status: 'blocked',
        summary: 'Implementation failed.',
        changedPaths: [],
        testChanges: [],
        notes: [],
        failure: {
          kind: 'nonzero-exit',
          exitCode: 2,
          durationMs: 50,
          diagnostic: 'failed',
        },
      },
    });

    expect(markdown).toContain('- Changed paths: 0');
    expect(markdown).toContain('- Exit code: 2');
    expect(markdown).toContain('- Duration: 50 ms');
    expect(markdown).toContain('## Test Changes\n- None recorded.');
    expect(markdown).toContain('## Notes\n- None recorded.');
    expect(markdown).not.toContain('- Signal:');
    expect(markdown).not.toContain('- Timed out:');
  });
});
