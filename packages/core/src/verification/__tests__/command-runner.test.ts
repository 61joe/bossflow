import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CommandRunner } from '../index.js';
import { getErrorExitCode, getErrorOutput } from '../command-runner.js';
import type { VerificationCommand } from '../../contracts/index.js';

const NOW = '2026-11-03T00:00:00.000Z';

describe('CommandRunner', () => {
  it('captures successful output with real exit status', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'bossflow-command-success-'));

    try {
      const result = await new CommandRunner({
        now: () => new Date(NOW),
      }).run(
        command({
          args: ['-e', 'process.stdout.write("verified")'],
        }),
        cwd,
      );
      expect(result).toMatchObject({
        commandId: 'test',
        status: 'passed',
        exitCode: 0,
        stdout: 'verified',
        redacted: true,
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('captures non-zero exit codes and redacts secrets', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'bossflow-command-failure-'));

    try {
      const result = await new CommandRunner().run(
        command({
          args: ['-e', 'process.stderr.write("token=sk-super-secret-token"); process.exit(7)'],
        }),
        cwd,
      );
      expect(result).toMatchObject({
        status: 'failed',
        exitCode: 7,
        redacted: true,
      });
      expect(result.stderr).toContain('[REDACTED]');
      expect(result.stderr).not.toContain('sk-super-secret-token');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('redacts explicit secrets and secret-shaped environment values', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'bossflow-command-environment-secret-'));
    const environmentSecret = 'environment-secret-placeholder';
    const explicitSecret = 'explicit-secret-placeholder';

    try {
      const result = await new CommandRunner({
        environment: {
          DEEPSEEK_API_KEY: environmentSecret,
          MISSING_KEY: undefined,
          NORMAL_VALUE: 'visible',
        },
        secrets: [explicitSecret],
      }).run(
        command({
          args: [
            '-e',
            `process.stdout.write(${JSON.stringify(`${environmentSecret}\n${explicitSecret}`)})`,
          ],
        }),
        cwd,
      );

      expect(result.stdout).not.toContain(environmentSecret);
      expect(result.stdout).not.toContain(explicitSecret);
      expect(result.stdout.match(/\[REDACTED\]/g)).toHaveLength(2);
      expect(result.redacted).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('reports timeout and cancellation diagnostics', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'bossflow-command-cancel-'));
    const controller = new AbortController();

    try {
      const timedOut = await new CommandRunner().run(
        command({
          args: ['-e', 'setTimeout(() => {}, 1000)'],
          timeoutMs: 20,
        }),
        cwd,
      );
      expect(timedOut.status).toBe('failed');
      expect(timedOut.stderr).toContain('[COMMAND_TIMED_OUT]');

      setTimeout(() => controller.abort(), 20);
      const canceled = await new CommandRunner().run(
        command({
          args: ['-e', 'setTimeout(() => {}, 1000)'],
          timeoutMs: 1_000,
        }),
        cwd,
        controller.signal,
      );
      expect(canceled.status).toBe('failed');
      expect(canceled.stderr).toContain('[COMMAND_CANCELED]');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe('CommandRunner limits and failures', () => {
  it('enforces the bounded output limit', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'bossflow-command-buffer-'));

    try {
      const result = await new CommandRunner({
        maxOutputBytes: 64,
      }).run(
        command({
          args: ['-e', 'process.stdout.write("x".repeat(10000))'],
        }),
        cwd,
      );
      expect(result.status).toBe('failed');
      expect(result.stdout).toContain('OUTPUT');
      expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(200);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('returns a failed result when the command cannot start', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'bossflow-command-missing-'));

    try {
      const result = await new CommandRunner().run(
        command({
          command: path.join(cwd, 'missing-command'),
        }),
        cwd,
      );
      expect(result).toMatchObject({
        status: 'failed',
        redacted: true,
      });
      expect(result.stderr.length).toBeGreaterThan(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('extracts optional error output and exit codes defensively', () => {
    expect(getErrorOutput(null, 'stdout')).toBe('');
    expect(getErrorOutput({ stdout: 'output' }, 'stdout')).toBe('output');
    expect(getErrorOutput({ stdout: 1 }, 'stdout')).toBe('');
    expect(getErrorExitCode(null)).toBeUndefined();
    expect(getErrorExitCode({ exitCode: 2 })).toBe(2);
    expect(getErrorExitCode({ exitCode: '2' })).toBeUndefined();
  });
});

function command(overrides: Partial<VerificationCommand>): VerificationCommand {
  return {
    id: 'test',
    label: 'Test',
    command: process.execPath,
    args: [],
    required: true,
    timeoutMs: 5_000,
    ...overrides,
  };
}
