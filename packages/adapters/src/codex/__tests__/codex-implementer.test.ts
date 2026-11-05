/* eslint-disable max-lines-per-function -- Failure scenarios share one adapter fixture and assertion sequence. */
import { jest } from '@jest/globals';

const execaMock =
  jest.fn<
    (
      command: string,
      args: readonly string[],
      options: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>
  >();

jest.unstable_mockModule('execa', () => ({
  execa: execaMock,
}));

const { createCodexWorktreeImplementer } = await import('../index.js');
const { CODEX_MAX_FAILURE_DIAGNOSTIC_BYTES } = await import('../constant.js');

describe('CodexWorktreeImplementer', () => {
  it('reports successful coding agent execution and keeps approved scope in the prompt', async () => {
    execaMock.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });
    const implementer = createCodexWorktreeImplementer();
    const result = await implementer(implementationContext());

    expect(result).toMatchObject({
      status: 'completed',
      changedPaths: [],
    });
    expect(execaMock).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['exec', '--ephemeral', '--sandbox', 'workspace-write']),
      expect.objectContaining({
        cwd: '/tmp/worktree',
        stdin: 'ignore',
        timeout: 1_800_000,
        maxBuffer: 1_048_576,
      }),
    );
    expect(execaMock.mock.calls[0]?.[1].at(-1)).toContain('Approved paths:\n- src');
  });

  it('returns blocked evidence for non-zero and thrown coding agent failures', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 2,
      stdout: 'stdout details',
      stderr: 'token=placeholder-secret',
      durationMs: 123,
    });
    const nonZero = await createCodexWorktreeImplementer()(implementationContext());
    expect(nonZero).toMatchObject({
      status: 'blocked',
      failure: {
        kind: 'nonzero-exit',
        exitCode: 2,
        durationMs: 123,
      },
    });
    expect(nonZero.notes[0]).toContain('[REDACTED]');
    expect(nonZero.notes[0]).toContain('stdout details');

    execaMock.mockRejectedValueOnce(new Error('spawn failed'));
    const thrown = await createCodexWorktreeImplementer()(implementationContext());
    expect(thrown).toMatchObject({
      status: 'blocked',
      notes: ['spawn failed'],
      failure: { kind: 'spawn-error', diagnostic: 'spawn failed' },
    });
  });

  it('distinguishes timeout, cancellation, signals, and unknown outcomes', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: undefined,
      stdout: '',
      stderr: 'timed out',
      timedOut: true,
      signal: 'SIGTERM',
      durationMs: 100,
    });
    await expect(createCodexWorktreeImplementer()(implementationContext())).resolves.toMatchObject({
      summary: 'Codex implementation timed out after 100 ms.',
      failure: {
        kind: 'timeout',
        timedOut: true,
        signal: 'SIGTERM',
      },
    });

    execaMock.mockResolvedValueOnce({
      exitCode: undefined,
      timedOut: true,
      durationMs: 101,
    });
    const timeoutWithoutSignal = await createCodexWorktreeImplementer()(implementationContext());
    expect(timeoutWithoutSignal.failure).toMatchObject({ kind: 'timeout' });
    expect(timeoutWithoutSignal.failure).not.toHaveProperty('signal');

    execaMock.mockResolvedValueOnce({
      exitCode: 130,
      isCanceled: true,
      durationMs: 102,
    });
    await expect(createCodexWorktreeImplementer()(implementationContext())).resolves.toMatchObject({
      failure: { kind: 'canceled', durationMs: 102 },
    });

    const aborted = new AbortController();
    aborted.abort();
    execaMock.mockResolvedValueOnce({ exitCode: undefined, signal: 'SIGINT' });
    await expect(
      createCodexWorktreeImplementer()({
        ...implementationContext(),
        signal: aborted.signal,
      }),
    ).resolves.toMatchObject({
      failure: { kind: 'canceled' },
    });

    execaMock.mockResolvedValueOnce({ exitCode: undefined, signal: 'SIGKILL' });
    await expect(createCodexWorktreeImplementer()(implementationContext())).resolves.toMatchObject({
      summary: 'Codex implementation was terminated by signal SIGKILL.',
      failure: { kind: 'signaled', signal: 'SIGKILL' },
    });

    execaMock.mockResolvedValueOnce({ exitCode: undefined, stdout: '', stderr: '' });
    const noDetails = await createCodexWorktreeImplementer()(implementationContext());
    expect(noDetails.summary).toContain('unknown process outcome');
    expect(noDetails.notes).toEqual(['No coding agent diagnostics were returned.']);
    expect(noDetails.failure).toMatchObject({ kind: 'unknown' });
  });

  it('bounds failure diagnostics while preserving head and tail content', async () => {
    const head = `head-${'a'.repeat(2_500)}`;
    const tail = `${'b'.repeat(2_500)}-tail`;
    execaMock.mockResolvedValueOnce({
      exitCode: 1,
      stderr: head,
      stdout: tail,
    });

    const result = await createCodexWorktreeImplementer()(implementationContext());
    const diagnostic = result.failure?.diagnostic ?? '';
    expect(diagnostic).toContain('head-');
    expect(diagnostic).toContain('-tail');
    expect(diagnostic).toContain('[DIAGNOSTIC_MIDDLE_OMITTED');
    expect(Buffer.byteLength(diagnostic)).toBeLessThanOrEqual(CODEX_MAX_FAILURE_DIAGNOSTIC_BYTES);
  });

  it('handles cancellation during process startup and non-Error failures', async () => {
    const controller = new AbortController();
    controller.abort();
    execaMock.mockRejectedValueOnce(new Error('aborted'));
    await expect(
      createCodexWorktreeImplementer()({
        ...implementationContext(),
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({
      failure: { kind: 'canceled' },
    });

    execaMock.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });
    await createCodexWorktreeImplementer()({
      ...implementationContext(),
      signal: controller.signal,
    });
    expect(execaMock).toHaveBeenLastCalledWith(
      'codex',
      expect.any(Array),
      expect.objectContaining({ cancelSignal: controller.signal }),
    );

    execaMock.mockRejectedValueOnce('string failure');
    await expect(createCodexWorktreeImplementer()(implementationContext())).resolves.toMatchObject({
      status: 'blocked',
      notes: ['string failure'],
      failure: { kind: 'spawn-error', diagnostic: 'string failure' },
    });
  });
});

function implementationContext() {
  return {
    runId: 'run-1',
    repositoryRoot: '/tmp/repository',
    worktreePath: '/tmp/worktree',
    baseCommit: 'a'.repeat(40),
    plan: {
      schemaVersion: 1 as const,
      summary: 'Implement.',
      affectedPaths: ['src'],
      tasks: [],
      interfaceChanges: [],
      risks: [],
      verificationCommands: [],
    },
    approvedPaths: ['src'],
  };
}
