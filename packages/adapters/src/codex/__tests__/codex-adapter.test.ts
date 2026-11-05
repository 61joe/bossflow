import { CodexAdapter } from '../index.js';

describe('CodexAdapter', () => {
  it('exposes Codex execution and installation capabilities', () => {
    const adapter = new CodexAdapter();

    expect(adapter.describe()).toEqual({
      id: 'codex',
      displayName: 'Codex Desktop',
      invocation: '$bossflow',
    });
    expect(adapter.createWorktreeImplementer()).toEqual(expect.any(Function));
    expect(adapter.installSkill).toEqual(expect.any(Function));
  });
});
