import type {
  AdapterDescriptor,
  CodingAgentAdapter,
  CodingAgentSkillInstaller,
  CodingAgentSkillInstallResult,
  WorktreeImplementer,
} from '@bossflow/core';

import { CodingAgentRegistry, createDefaultCodingAgentRegistry } from '../index.js';

describe('CodingAgentRegistry', () => {
  it('registers adapter capabilities and creates implementers', async () => {
    const registry = new CodingAgentRegistry();
    const implementer = createImplementer();
    const installResult: CodingAgentSkillInstallResult = {
      status: 'installed',
      skillPath: '/project/.agents/skills/custom/SKILL.md',
    };
    const adapter = createAdapter(implementer, {
      installSkill: async () => installResult,
    });

    expect(registry.register(adapter)).toBe(registry);
    expect(registry.describe(' custom ')).toEqual(adapter.describe());
    expect(registry.createImplementer('custom')).toBe(implementer);
    expect(registry.has(' custom ')).toBe(true);
    expect(registry.supportsSkillInstallation('custom')).toBe(true);
    await expect(registry.installSkill('custom', { projectRoot: '/project' })).resolves.toEqual(
      installResult,
    );
  });

  it('handles adapters without installation capability', () => {
    const registry = new CodingAgentRegistry().register(createAdapter(createImplementer()));

    expect(registry.supportsSkillInstallation('custom')).toBe(false);
    expect(() => registry.installSkill('custom', { projectRoot: '/project' })).toThrow(
      'does not install Skills',
    );
  });

  it('rejects empty, duplicate, and unknown adapter IDs', () => {
    const registry = new CodingAgentRegistry();
    registry.register(createAdapter(createImplementer()));

    expect(() => registry.register(createAdapter(createImplementer(), { id: ' ' }))).toThrow(
      'must not be empty',
    );
    expect(() => registry.register(createAdapter(createImplementer()))).toThrow(
      'already registered',
    );
    expect(() => registry.createImplementer('missing')).toThrow('is not registered');
    expect(() => registry.describe('missing')).toThrow('is not registered');
    expect(() => registry.supportsSkillInstallation('missing')).toThrow('is not registered');
  });

  it('registers the default Codex adapter', () => {
    const registry = createDefaultCodingAgentRegistry();

    expect(registry.describe('codex')).toMatchObject({ id: 'codex' });
    expect(registry.createImplementer('codex')).toEqual(expect.any(Function));
    expect(registry.supportsSkillInstallation('codex')).toBe(true);
  });
});

function createImplementer(): WorktreeImplementer {
  return async () => ({
    schemaVersion: 1,
    status: 'completed',
    summary: 'Implemented.',
    changedPaths: [],
    testChanges: [],
    notes: [],
  });
}

function createAdapter(
  implementer: WorktreeImplementer,
  options: Partial<CodingAgentSkillInstaller> & { readonly id?: string } = {},
): CodingAgentAdapter & Partial<CodingAgentSkillInstaller> {
  const descriptor: AdapterDescriptor = {
    id: options.id ?? 'custom',
    displayName: 'Custom Agent',
    invocation: '$custom',
  };
  return {
    describe: () => descriptor,
    createWorktreeImplementer: () => implementer,
    ...(options.installSkill === undefined ? {} : { installSkill: options.installSkill }),
  };
}
