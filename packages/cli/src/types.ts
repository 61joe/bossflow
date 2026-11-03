export interface RunCommandOptions {
  readonly model?: string;
  readonly profile?: string;
  readonly confirmProject?: boolean;
  readonly stopAfter?: 'spec';
}

export interface ApproveCommandOptions {
  readonly gate: 'plan' | 'review';
  readonly action: readonly ('commit' | 'push' | 'merge' | 'pr')[];
  readonly actor?: string;
  readonly note?: string;
}

export interface AdapterInstallCommandOptions {
  readonly project?: string;
  readonly overwrite?: boolean;
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
