import { VerificationCommandResolver, createDefaultVerificationSettings } from '../index.js';

describe('VerificationCommandResolver', () => {
  it('resolves package scripts and aliases', () => {
    const result = new VerificationCommandResolver().resolve({
      packageManager: 'pnpm',
      packageScripts: {
        'lint:check': 'eslint .',
        'check:types': 'tsc --noEmit',
        test: 'jest',
        compile: 'tsc',
      },
      settings: createDefaultVerificationSettings(),
    });

    expect(result.commands).toEqual([
      expect.objectContaining({ id: 'lint', command: 'pnpm', args: ['run', 'lint:check'] }),
      expect.objectContaining({ id: 'typecheck', args: ['run', 'check:types'] }),
      expect.objectContaining({ id: 'test', args: ['run', 'test'] }),
      expect.objectContaining({ id: 'build', args: ['run', 'compile'] }),
    ]);
    expect(result.ambiguities).toEqual([]);
  });

  it('prefers explicit overrides and uses npm for an unknown package manager', () => {
    const settings = createDefaultVerificationSettings();
    const result = new VerificationCommandResolver().resolve({
      packageManager: 'unknown',
      packageScripts: { lint: 'eslint .' },
      settings: {
        ...settings,
        requiredCommands: ['lint', 'test'],
        defaultTimeoutMs: 1_000,
        commandOverrides: {
          test: {
            command: 'node',
            args: ['--test'],
            timeoutMs: 5_000,
          },
        },
      },
    });

    expect(result.commands).toEqual([
      expect.objectContaining({ id: 'lint', command: 'npm', timeoutMs: 1_000 }),
      expect.objectContaining({
        id: 'test',
        command: 'node',
        args: ['--test'],
        timeoutMs: 5_000,
      }),
    ]);
  });

  it('reports missing required commands and ignores optional missing commands', () => {
    const resolver = new VerificationCommandResolver();
    const defaults = createDefaultVerificationSettings();
    const missing = resolver.resolve({
      packageManager: 'npm',
      packageScripts: {},
      settings: {
        ...defaults,
        requiredCommands: ['lint', 'build'],
      },
    });
    const optional = resolver.resolve({
      packageManager: 'npm',
      packageScripts: {},
      settings: {
        ...defaults,
        requiredCommands: ['lint'],
      },
    });

    expect(missing.commands).toEqual([]);
    expect(missing.ambiguities).toHaveLength(2);
    expect(optional.ambiguities).toHaveLength(1);
  });
});
