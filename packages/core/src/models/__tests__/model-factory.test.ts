import { jest } from '@jest/globals';

const providerConfigs: Record<string, unknown>[] = [];

class MockOpenAIProvider {
  constructor(config: Record<string, unknown>) {
    providerConfigs.push(config);
  }

  getModel(): never {
    throw new Error('not used');
  }
}

jest.unstable_mockModule('@openai/agents', () => ({
  OpenAIProvider: MockOpenAIProvider,
}));

const { createModelRuntime } = await import('../index.js');

describe('createModelRuntime', () => {
  beforeEach(() => {
    providerConfigs.length = 0;
  });

  it('creates an OpenAI-compatible runtime', () => {
    const runtime = createModelRuntime({
      kind: 'openai-compatible',
      apiKey: 'compatible-key',
      model: 'compatible-model',
      baseUrl: 'https://models.example.com',
    });

    expect(runtime).toMatchObject({
      model: 'compatible-model',
      structuredOutputMode: 'prompt-json',
    });
    expect(providerConfigs[0]).toMatchObject({
      apiKey: 'compatible-key',
      baseURL: 'https://models.example.com',
      useResponses: false,
      strictFeatureValidation: true,
    });
  });

  it('creates an OpenAI runtime with optional fields omitted', () => {
    const runtime = createModelRuntime({
      kind: 'openai',
      apiKey: 'openai-key',
    });

    expect(runtime).toEqual({
      provider: expect.any(MockOpenAIProvider),
      structuredOutputMode: 'native',
    });
    expect(providerConfigs[0]).toEqual({ apiKey: 'openai-key' });
  });

  it('propagates optional OpenAI settings', () => {
    const runtime = createModelRuntime({
      kind: 'openai',
      apiKey: 'openai-key',
      model: 'openai-model',
      baseUrl: 'https://proxy.example.com',
      useResponses: false,
    });

    expect(runtime.model).toBe('openai-model');
    expect(providerConfigs[0]).toEqual({
      apiKey: 'openai-key',
      baseURL: 'https://proxy.example.com',
      useResponses: false,
    });
  });
});
