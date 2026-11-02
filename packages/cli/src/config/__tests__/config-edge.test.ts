import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { stringify } from 'yaml';

import { BossFlowConfigSchema, createDefaultConfig, loadConfig, saveConfig } from '../index.js';
import type { BossFlowConfig } from '../index.js';

describe('config edge cases', () => {
  it('loads legacy config without a models section', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-config-legacy-'));
    const configPath = path.join(projectRoot, '.bossflow', 'config.yaml');

    try {
      await mkdir(path.dirname(configPath), { recursive: true });
      await writeFile(
        configPath,
        stringify({
          schemaVersion: 1,
          workflow: {
            initialStage: 'spec',
            runDirectory: '.bossflow/runs',
          },
        }),
        'utf8',
      );

      await expect(loadConfig(projectRoot)).resolves.toMatchObject({
        models: {
          defaultProfile: 'openai',
        },
        workflow: {
          verification: {
            requiredCommands: ['lint', 'typecheck', 'test', 'build'],
          },
        },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('saves validated config and creates parent directories', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-config-save-'));

    try {
      await saveConfig(projectRoot, createDefaultConfig());
      await expect(loadConfig(projectRoot)).resolves.toEqual(createDefaultConfig());
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects a missing default profile', () => {
    const invalidConfig = createDefaultConfig() as BossFlowConfig;
    const result = BossFlowConfigSchema.safeParse({
      ...invalidConfig,
      models: {
        defaultProfile: 'missing',
        profiles: invalidConfig.models.profiles,
      },
    });

    expect(result.success).toBe(false);
  });

  it('accepts secure HTTPS endpoints and rejects unsupported protocols', () => {
    const base = createDefaultConfig();
    const secure = BossFlowConfigSchema.safeParse({
      ...base,
      models: {
        defaultProfile: 'remote',
        profiles: {
          remote: {
            kind: 'openai-compatible',
            model: 'remote-model',
            baseUrl: 'https://models.example.com/v1',
          },
        },
      },
    });
    const unsupported = BossFlowConfigSchema.safeParse({
      ...base,
      models: {
        defaultProfile: 'remote',
        profiles: {
          remote: {
            kind: 'openai-compatible',
            model: 'remote-model',
            baseUrl: 'ftp://models.example.com/v1',
          },
        },
      },
    });

    expect(secure.success).toBe(true);
    expect(unsupported.success).toBe(false);
  });

  it('supports verification command overrides and timeout budgets', () => {
    const config = createDefaultConfig();
    const parsed = BossFlowConfigSchema.parse({
      ...config,
      workflow: {
        ...config.workflow,
        verification: {
          requiredCommands: ['lint', 'test'],
          defaultTimeoutMs: 30_000,
          commandOverrides: {
            lint: { command: 'node', args: ['scripts/lint.mjs'], timeoutMs: 5_000 },
          },
        },
      },
    });

    expect(parsed.workflow.verification).toMatchObject({
      requiredCommands: ['lint', 'test'],
      commandOverrides: {
        lint: { command: 'node', args: ['scripts/lint.mjs'], timeoutMs: 5_000 },
      },
    });
  });
});
