import type { ModelProvider } from '@openai/agents';

export interface OpenAIModelRuntimeConfig {
  readonly kind: 'openai';
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly useResponses?: boolean;
}

export interface OpenAICompatibleModelRuntimeConfig {
  readonly kind: 'openai-compatible';
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
}

export type ModelRuntimeConfig = OpenAIModelRuntimeConfig | OpenAICompatibleModelRuntimeConfig;

export type StructuredOutputMode = 'native' | 'prompt-json';

export interface ModelRuntime {
  readonly provider: ModelProvider;
  readonly model?: string;
  readonly structuredOutputMode: StructuredOutputMode;
}
