import type { WorkflowStage } from '@bossflow/core';

export type ModelsConfig = {
  readonly defaultProfile: string;
  readonly profiles: Readonly<Record<string, ModelProfile>>;
};

export interface OpenAIModelProfile {
  readonly kind: 'openai';
  readonly model?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly apiKeyEnv?: string | undefined;
  readonly useResponses?: boolean | undefined;
}

export interface OpenAICompatibleModelProfile {
  readonly kind: 'openai-compatible';
  readonly model: string;
  readonly baseUrl: string;
  readonly apiKeyEnv?: string | undefined;
}

export type ModelProfile = OpenAIModelProfile | OpenAICompatibleModelProfile;

export interface BossFlowConfig {
  readonly schemaVersion: 1;
  readonly workflow: {
    readonly initialStage: WorkflowStage;
    readonly runDirectory: string;
  };
  readonly models: ModelsConfig;
}

export type InitResult = 'created' | 'exists';

export interface AddModelProfileOptions {
  readonly name: string;
  readonly kind: ModelProfile['kind'];
  readonly model?: string;
  readonly baseUrl?: string;
  readonly apiKeyEnv?: string;
  readonly useResponses?: boolean;
  readonly setDefault: boolean;
}

export interface ModelProfileSummary {
  readonly name: string;
  readonly isDefault: boolean;
  readonly profile: ModelProfile;
}

export type CredentialSource = 'environment' | 'local-file' | 'missing';

export interface CredentialResolution {
  readonly source: CredentialSource;
  readonly envName: string;
  readonly apiKey?: string;
}
