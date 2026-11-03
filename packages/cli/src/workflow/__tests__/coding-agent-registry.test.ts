import type { WorktreeImplementer } from '@bossflow/core';

import { CodingAgentRegistry, createDefaultCodingAgentRegistry } from '../index.js';

describe('CodingAgentRegistry', () => {
  it('registers and creates coding agent implementers', () => {
    const registry = new CodingAgentRegistry();
    const implementer: WorktreeImplementer = async () => ({
      schemaVersion: 1,
      status: 'completed',
      summary: 'Implemented.',
      changedPaths: [],
      testChanges: [],
      notes: [],
    });

    expect(registry.register('custom', () => implementer)).toBe(registry);
    expect(registry.create('custom')).toBe(implementer);
    expect(registry.create(' custom ')).toBe(implementer);
  });

  it('rejects empty, duplicate, and unknown adapter IDs', () => {
    const registry = new CodingAgentRegistry();
    registry.register('custom', () => async () => ({
      schemaVersion: 1,
      status: 'completed',
      summary: 'Implemented.',
      changedPaths: [],
      testChanges: [],
      notes: [],
    }));

    expect(() =>
      registry.register(' ', () => async () => {
        throw new Error('not used');
      }),
    ).toThrow('must not be empty');
    expect(() =>
      registry.register('custom', () => async () => {
        throw new Error('not used');
      }),
    ).toThrow('already registered');
    expect(() => registry.create('missing')).toThrow('is not registered');
  });

  it('registers the default Codex adapter', () => {
    expect(createDefaultCodingAgentRegistry().create('codex')).toEqual(expect.any(Function));
  });
});
