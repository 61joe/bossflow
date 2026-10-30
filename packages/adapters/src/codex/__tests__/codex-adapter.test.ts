import { CodexAdapter } from '../index.js';

describe('CodexAdapter', () => {
  it('describes the Codex invocation boundary', () => {
    const adapter = new CodexAdapter();

    expect(adapter.describe()).toEqual({
      id: 'codex',
      displayName: 'Codex Desktop',
      invocation: '$bossflow',
    });
  });
});
