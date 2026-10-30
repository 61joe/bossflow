import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { initializeProject, loadConfig } from '../../config/index.js';
import { addModelProfile, getModelProfile, resolveModelRuntime } from '../index.js';

describe('model profiles', () => {
  it('stores model configuration without storing the API key', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-model-config-'));

    try {
      await initializeProject(projectRoot);
      await addModelProfile(projectRoot, {
        name: 'local',
        kind: 'openai-compatible',
        model: 'coding-model',
        baseUrl: 'http://localhost:11434/v1',
        apiKeyEnv: 'LOCAL_MODEL_API_KEY',
        setDefault: true,
      });

      const config = await loadConfig(projectRoot);
      const selectedProfile = getModelProfile(config);
      expect(selectedProfile).toMatchObject({
        name: 'local',
        isDefault: true,
        profile: {
          kind: 'openai-compatible',
          model: 'coding-model',
          baseUrl: 'http://localhost:11434/v1',
          apiKeyEnv: 'LOCAL_MODEL_API_KEY',
        },
      });

      const rawConfig = await readFile(path.join(projectRoot, '.bossflow', 'config.yaml'), 'utf8');
      expect(rawConfig).not.toContain('super-secret');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects insecure remote HTTP endpoints', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-model-config-'));

    try {
      await initializeProject(projectRoot);
      await expect(
        addModelProfile(projectRoot, {
          name: 'insecure',
          kind: 'openai-compatible',
          model: 'coding-model',
          baseUrl: 'http://models.example.com/v1',
          setDefault: false,
        }),
      ).rejects.toThrow('Only HTTPS endpoints or HTTP endpoints on localhost are allowed.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('builds a model runtime from a compatible provider profile', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-model-config-'));

    try {
      await initializeProject(projectRoot);
      await addModelProfile(projectRoot, {
        name: 'local',
        kind: 'openai-compatible',
        model: 'coding-model',
        baseUrl: 'http://localhost:11434/v1',
        apiKeyEnv: 'LOCAL_MODEL_API_KEY',
        setDefault: true,
      });

      const resolved = await resolveModelRuntime({
        projectRoot,
        environment: {
          LOCAL_MODEL_API_KEY: 'test-key',
        },
      });

      expect(resolved).toMatchObject({
        profileName: 'local',
        credentialSource: 'environment',
        runtime: {
          model: 'coding-model',
        },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
