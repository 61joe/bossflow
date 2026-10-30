import { OpenAIProvider } from '@openai/agents';

import type { ModelRuntime, ModelRuntimeConfig } from './types.js';

export function createModelRuntime(config: ModelRuntimeConfig): ModelRuntime {
  if (config.kind === 'openai-compatible') {
    return {
      model: config.model,
      structuredOutputMode: 'prompt-json',
      provider: new OpenAIProvider({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        useResponses: false,
        strictFeatureValidation: true,
      }),
    };
  }

  const provider = new OpenAIProvider({
    apiKey: config.apiKey,
    ...(config.baseUrl === undefined ? {} : { baseURL: config.baseUrl }),
    ...(config.useResponses === undefined ? {} : { useResponses: config.useResponses }),
  });

  return {
    provider,
    structuredOutputMode: 'native',
    ...(config.model === undefined ? {} : { model: config.model }),
  };
}
