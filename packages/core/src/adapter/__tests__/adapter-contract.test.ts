import type {
  CodingAgentAdapter,
  CodingAgentSkillInstaller,
  CodingAgentSkillInstallResult,
} from '../index.js';

describe('Coding Agent adapter contract', () => {
  it('allows execution and installation capabilities to be modeled separately', async () => {
    const installResult: CodingAgentSkillInstallResult = {
      status: 'installed',
      skillPath: '/project/.agents/skills/example/SKILL.md',
    };
    const adapter: CodingAgentAdapter = {
      describe: () => ({
        id: 'example',
        displayName: 'Example Agent',
        invocation: '$example',
      }),
      createWorktreeImplementer: () => async (context) => ({
        schemaVersion: 1,
        status: 'completed',
        summary: `Implemented ${context.runId}.`,
        changedPaths: [],
        testChanges: [],
        notes: [],
      }),
    };
    const installer: CodingAgentSkillInstaller = {
      installSkill: async () => installResult,
    };

    expect(adapter.describe().id).toBe('example');
    await expect(
      adapter.createWorktreeImplementer()({
        runId: 'run-1',
        repositoryRoot: '/project',
        worktreePath: '/project/.worktrees/run-1',
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
      }),
    ).resolves.toMatchObject({ status: 'completed' });
    await expect(installer.installSkill({ projectRoot: '/project' })).resolves.toEqual(
      installResult,
    );
  });
});
