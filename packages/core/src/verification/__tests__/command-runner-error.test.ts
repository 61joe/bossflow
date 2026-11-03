import { jest } from '@jest/globals';

const execaMock = jest.fn(async () => {
  throw {
    exitCode: 2,
    stdout: 'token=sk-super-secret-token',
    stderr: 'boom',
    message: 'command failed',
  };
});

jest.unstable_mockModule('execa', () => ({
  execa: execaMock,
}));

const { CommandRunner } = await import('../command-runner.js');

describe('CommandRunner error boundary', () => {
  it('converts thrown process errors into redacted evidence', async () => {
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

    expect(result).toMatchObject({
      status: 'failed',
      exitCode: 2,
      redacted: true,
    });
    expect(result.stdout).toContain('[REDACTED]');
    expect(result.stdout).not.toContain('sk-super-secret-token');
    expect(result.stderr).toContain('boom');
  });

  it('omits exit codes when a thrown error has none', async () => {
    execaMock.mockImplementationOnce(async () => {
      throw { message: 'spawn failed' };
    });
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

    expect(result.exitCode).toBeUndefined();
    expect(result.stderr).toContain('spawn failed');
  });
});
