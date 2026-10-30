import type { ModelRuntime } from '@bossflow/core';

import type { CredentialSource, ModelProfile } from '../config/index.js';

export interface ResolveModelRuntimeOptions {
  readonly projectRoot: string;
  readonly profileName?: string;
  readonly modelOverride?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export interface ResolvedModelRuntime {
  readonly runtime: ModelRuntime;
  readonly profileName: string;
  readonly profile: ModelProfile;
  readonly credentialSource: CredentialSource;
}
