import {
  ProjectProfileSchema,
  VerificationSettingsSchema,
  createDefaultVerificationSettings,
} from '../index.js';

describe('project context schemas', () => {
  it('creates default verification settings', () => {
    expect(VerificationSettingsSchema.parse({})).toEqual(createDefaultVerificationSettings());
  });

  it('rejects duplicate required verification commands', () => {
    expect(() =>
      VerificationSettingsSchema.parse({
        requiredCommands: ['lint', 'lint'],
      }),
    ).toThrow('must be unique');
  });

  it('applies the user confirmation default to project profiles', () => {
    const profile = ProjectProfileSchema.parse({
      schemaVersion: 1,
      repositoryRoot: '/tmp/project',
      git: {
        isRepository: true,
        status: 'clean',
        changedPaths: [],
      },
      packageManager: 'pnpm',
      languages: ['TypeScript'],
      frameworks: [],
      conventionFiles: ['AGENTS.md'],
      planningContextFiles: ['AGENTS.md'],
      testConfigFiles: ['jest.config.ts'],
      packageScripts: { test: 'jest' },
      verificationCommands: [
        {
          id: 'test',
          label: 'Test',
          command: 'pnpm',
          args: ['run', 'test'],
          required: true,
          timeoutMs: 120_000,
        },
      ],
      ambiguities: [],
      requiresConfirmation: false,
    });

    expect(profile.confirmedByUser).toBe(false);
  });
});
