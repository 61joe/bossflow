import { createModelRuntime } from '@bossflow/core';

import { loadConfig } from '../config/index.js';
import { resolveCredential } from './credentials.js';
import { getModelProfile } from './model-profiles.js';
import type { ResolvedModelRuntime, ResolveModelRuntimeOptions } from './types.js';

export async function resolveModelRuntime(
  options: ResolveModelRuntimeOptions,
): Promise<ResolvedModelRuntime> {
  const config = await loadConfig(options.projectRoot);
  const selectedProfile = getModelProfile(config, options.profileName);
  const credential = await resolveCredential(
    options.projectRoot,
    selectedProfile.name,
    selectedProfile.profile,
    options.environment,
  );

  if (credential.apiKey === undefined) {
    throw new Error(
      `API key for model profile "${selectedProfile.name}" is missing. ` +
        `Set environment variable ${credential.envName} or run ` +
        `"bossflow auth set ${selectedProfile.name}".`,
    );
  }

  const runtime =
    selectedProfile.profile.kind === 'openai-compatible'
      ? createModelRuntime({
          kind: 'openai-compatible',
          apiKey: credential.apiKey,
          model: options.modelOverride ?? selectedProfile.profile.model,
          baseUrl: selectedProfile.profile.baseUrl,
        })
      : createModelRuntime({
          kind: 'openai',
          apiKey: credential.apiKey,
          ...(options.modelOverride === undefined
            ? selectedProfile.profile.model === undefined
              ? {}
              : { model: selectedProfile.profile.model }
            : { model: options.modelOverride }),
          ...(selectedProfile.profile.baseUrl === undefined
            ? {}
            : { baseUrl: selectedProfile.profile.baseUrl }),
          ...(selectedProfile.profile.useResponses === undefined
            ? {}
            : { useResponses: selectedProfile.profile.useResponses }),
        });

  return {
    runtime,
    profileName: selectedProfile.name,
    profile: selectedProfile.profile,
    credentialSource: credential.source,
  };
}
