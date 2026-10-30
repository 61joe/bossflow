import { DEFAULT_COMPATIBLE_API_KEY_ENV, loadConfig, saveConfig } from '../config/index.js';
import { OPENAI_API_KEY_ENV } from '../environment/index.js';
import type {
  AddModelProfileOptions,
  BossFlowConfig,
  ModelProfile,
  ModelProfileSummary,
} from '../config/index.js';

const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function getModelProfile(
  config: BossFlowConfig,
  requestedProfile?: string,
): ModelProfileSummary {
  const name = requestedProfile ?? config.models.defaultProfile;
  const profile = config.models.profiles[name];
  if (profile === undefined) {
    throw new Error(`Model profile "${name}" does not exist.`);
  }

  return {
    name,
    isDefault: name === config.models.defaultProfile,
    profile,
  };
}

export function listModelProfiles(config: BossFlowConfig): readonly ModelProfileSummary[] {
  return Object.entries(config.models.profiles)
    .map(([name, profile]) => ({
      name,
      isDefault: name === config.models.defaultProfile,
      profile,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function addModelProfile(
  projectRoot: string,
  options: AddModelProfileOptions,
): Promise<ModelProfileSummary> {
  const name = options.name.trim();
  if (!PROFILE_NAME_PATTERN.test(name)) {
    throw new Error(
      'Profile names must start with a letter or number and contain only letters, numbers, "_" or "-".',
    );
  }

  const config = await loadConfig(projectRoot);
  const profile = createProfile(options);
  const profiles = {
    ...config.models.profiles,
    [name]: profile,
  };
  const nextConfig: BossFlowConfig = {
    ...config,
    models: {
      defaultProfile: options.setDefault ? name : config.models.defaultProfile,
      profiles,
    },
  };

  await saveConfig(projectRoot, nextConfig);
  return {
    name,
    isDefault: nextConfig.models.defaultProfile === name,
    profile,
  };
}

export async function useModelProfile(projectRoot: string, profileName: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  if (config.models.profiles[profileName] === undefined) {
    throw new Error(`Model profile "${profileName}" does not exist.`);
  }

  await saveConfig(projectRoot, {
    ...config,
    models: {
      ...config.models,
      defaultProfile: profileName,
    },
  });
}

export async function removeModelProfile(projectRoot: string, profileName: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  if (config.models.profiles[profileName] === undefined) {
    throw new Error(`Model profile "${profileName}" does not exist.`);
  }
  if (profileName === config.models.defaultProfile) {
    throw new Error('Select another default model profile before removing this one.');
  }
  if (Object.keys(config.models.profiles).length === 1) {
    throw new Error('At least one model profile must remain.');
  }

  const profiles = { ...config.models.profiles };
  delete profiles[profileName];
  await saveConfig(projectRoot, {
    ...config,
    models: {
      ...config.models,
      profiles,
    },
  });
}

function createProfile(options: AddModelProfileOptions): ModelProfile {
  const apiKeyEnv =
    options.apiKeyEnv ??
    (options.kind === 'openai' ? OPENAI_API_KEY_ENV : DEFAULT_COMPATIBLE_API_KEY_ENV);

  if (options.kind === 'openai') {
    return {
      kind: 'openai',
      apiKeyEnv,
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.useResponses === undefined ? {} : { useResponses: options.useResponses }),
    };
  }

  if (options.model === undefined || options.baseUrl === undefined) {
    throw new Error('OpenAI-compatible profiles require --model and --base-url.');
  }

  return {
    kind: 'openai-compatible',
    model: options.model,
    baseUrl: options.baseUrl,
    apiKeyEnv,
  };
}
