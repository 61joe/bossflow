import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { INITIAL_WORKFLOW_STAGE } from '@bossflow/core';
import { parse, stringify } from 'yaml';
import { z } from 'zod';

import { OPENAI_API_KEY_ENV } from '../environment/index.js';
import {
  BOSSFLOW_DIRECTORY,
  CONFIG_FILE,
  CONFIG_SCHEMA_VERSION,
  DEFAULT_MODEL_PROFILE,
  DEFAULT_RUN_DIRECTORY,
} from './constant.js';
import type { BossFlowConfig, InitResult, ModelsConfig } from './types.js';

const ApiKeyEnvSchema = z.string().regex(/^[A-Z_][A-Z0-9_]*$/);

const EndpointSchema = z
  .string()
  .url()
  .refine(isAllowedEndpoint, 'Only HTTPS endpoints or HTTP endpoints on localhost are allowed.');

const ModelProfileSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('openai'),
      model: z.string().trim().min(1).optional(),
      baseUrl: EndpointSchema.optional(),
      apiKeyEnv: ApiKeyEnvSchema.optional(),
      useResponses: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('openai-compatible'),
      model: z.string().trim().min(1),
      baseUrl: EndpointSchema,
      apiKeyEnv: ApiKeyEnvSchema.optional(),
    })
    .strict(),
]);

const ModelsConfigSchema = z
  .object({
    defaultProfile: z.string().trim().min(1),
    profiles: z.record(z.string().trim().min(1), ModelProfileSchema),
  })
  .strict()
  .superRefine((models, context) => {
    if (models.profiles[models.defaultProfile] === undefined) {
      context.addIssue({
        code: 'custom',
        message: `Default model profile "${models.defaultProfile}" does not exist.`,
        path: ['defaultProfile'],
      });
    }
  });

export const BossFlowConfigSchema = z
  .object({
    schemaVersion: z.literal(CONFIG_SCHEMA_VERSION),
    workflow: z
      .object({
        initialStage: z.literal(INITIAL_WORKFLOW_STAGE),
        runDirectory: z.string().min(1),
      })
      .strict(),
    models: ModelsConfigSchema.default(createDefaultModelsConfig()),
  })
  .strict();

export function createDefaultConfig(): BossFlowConfig {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    workflow: {
      initialStage: INITIAL_WORKFLOW_STAGE,
      runDirectory: DEFAULT_RUN_DIRECTORY,
    },
    models: createDefaultModelsConfig(),
  };
}

export function createDefaultModelsConfig(): ModelsConfig {
  return {
    defaultProfile: DEFAULT_MODEL_PROFILE,
    profiles: {
      [DEFAULT_MODEL_PROFILE]: {
        kind: 'openai',
        apiKeyEnv: OPENAI_API_KEY_ENV,
      },
    },
  };
}

export async function initializeProject(projectRoot: string): Promise<InitResult> {
  const configPath = getConfigPath(projectRoot);
  try {
    await access(configPath);
    return 'exists';
  } catch {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, stringify(createDefaultConfig()), 'utf8');
    return 'created';
  }
}

export async function loadConfig(projectRoot: string): Promise<BossFlowConfig> {
  const configPath = getConfigPath(projectRoot);
  const content = await readFile(configPath, 'utf8');
  return BossFlowConfigSchema.parse(parse(content));
}

export async function saveConfig(projectRoot: string, config: BossFlowConfig): Promise<void> {
  const validatedConfig = BossFlowConfigSchema.parse(config);
  const configPath = getConfigPath(projectRoot);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, stringify(validatedConfig), 'utf8');
}

function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, BOSSFLOW_DIRECTORY, CONFIG_FILE);
}

function isAllowedEndpoint(value: string): boolean {
  const endpoint = new URL(value);
  if (endpoint.protocol === 'https:') {
    return true;
  }

  return (
    endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname)
  );
}
