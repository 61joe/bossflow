import { jest } from '@jest/globals';

const execaMock = jest.fn(async () => ({
  exitCode: undefined,
  stdout: undefined,
  stderr: undefined,
  failed: true,
}));

jest.unstable_mockModule('execa', () => ({
  execa: execaMock,
}));

const { CommandRunner } = await import('../command-runner.js');

describe('CommandRunner missing output', () => {
  it('handles failed processes without output or exit codes', async () => {
    const result = await new CommandRunner().run(
      {
        id: 'test',
        label: 'Test',
        command: 'node',
        args: [],
        required: true,
        timeoutMs: 1_000,
      },
      '/tmp',
    );

    expect(result.status).toBe('failed');
    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toContain('[COMMAND_FAILED]');
  });
});
