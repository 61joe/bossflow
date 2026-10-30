export interface RunCommandOptions {
  readonly model?: string;
  readonly profile?: string;
}

export interface ModelAddCommandOptions {
  readonly kind: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly apiKeyEnv?: string;
  readonly chatCompletions?: boolean;
  readonly default?: boolean;
}

export interface AuthSetCommandOptions {
  readonly stdin?: boolean;
}
