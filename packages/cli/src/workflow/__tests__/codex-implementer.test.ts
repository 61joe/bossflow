import { jest } from '@jest/globals';

const execaMock = jest.fn<() => Promise<Record<string, unknown>>>();

jest.unstable_mockModule('execa', () => ({
  execa: execaMock,
}));

const { createCodexWorktreeImplementer } = await import('../index.js');

describe('CodexWorktreeImplementer', () => {
  it('reports successful coding agent execution', async () => {
    execaMock.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' });
    const implementer = createCodexWorktreeImplementer();
    const result = await implementer({
      runId: 'run-1',
      repositoryRoot: '/tmp/repository',
      worktreePath: '/tmp/worktree',
      baseCommit: 'a'.repeat(40),
      plan: {
        schemaVersion: 1,
        summary: 'Implement.',
        affectedPaths: ['src'],
        tasks: [],
        interfaceChanges: [],
        risks: [],
        verificationCommands: [],
      },
      approvedPaths: ['src'],
    });

    expect(result).toMatchObject({
      status: 'completed',
      changedPaths: [],
    });
    expect(execaMock).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['exec', '--ephemeral', '--sandbox', 'workspace-write']),
      expect.objectContaining({ cwd: '/tmp/worktree', stdin: 'ignore' }),
    );
  });

  it('returns blocked evidence for non-zero and thrown coding agent failures', async () => {
    execaMock.mockResolvedValueOnce({
      exitCode: 2,
      stdout: 'stdout details',
      stderr: 'token=placeholder-secret',
    });
    const nonZero = await createCodexWorktreeImplementer()(implementationContext());
    expect(nonZero).toMatchObject({ status: 'blocked' });
    expect(nonZero.notes[0]).toContain('[REDACTED]');
    expect(nonZero.notes[0]).toContain('stdout details');

    execaMock.mockRejectedValueOnce(new Error('spawn failed'));
    const thrown = await createCodexWorktreeImplementer()(implementationContext());
    expect(thrown).toMatchObject({
      status: 'blocked',
      notes: ['spawn failed'],
    });
  });

  it('handles missing exit codes, empty diagnostics, cancellation, and non-Error failures', async () => {
    execaMock.mockResolvedValueOnce({ exitCode: undefined, stdout: '', stderr: '' });
    const noDetails = await createCodexWorktreeImplementer()(implementationContext());
    expect(noDetails.summary).toContain('unknown');
    expect(noDetails.notes).toEqual(['No coding agent diagnostics were returned.']);

    const controller = new AbortController();
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
