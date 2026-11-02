import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { initializeProject } from '../../config/index.js';
import { addModelProfile, resolveModelRuntime } from '../index.js';

describe('resolveModelRuntime edge cases', () => {
  it('rejects missing credentials', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runtime-'));

    try {
      await initializeProject(projectRoot);
      await expect(resolveModelRuntime({ projectRoot, environment: {} })).rejects.toThrow(
        'API key for model profile',
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('resolves a minimal OpenAI profile', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runtime-'));

    try {
      await initializeProject(projectRoot);
      await expect(
        resolveModelRuntime({
          projectRoot,
          environment: { OPENAI_API_KEY: 'openai-key' },
        }),
      ).resolves.toMatchObject({
        profileName: 'openai',
        runtime: { structuredOutputMode: 'native' },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('propagates OpenAI settings and model overrides', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runtime-'));

    try {
      await initializeProject(projectRoot);
      await addModelProfile(projectRoot, {
        name: 'proxy',
        kind: 'openai',
        model: 'configured-model',
        baseUrl: 'https://proxy.example.com',
        useResponses: false,
        apiKeyEnv: 'PROXY_KEY',
        setDefault: true,
      });

      await expect(
        resolveModelRuntime({
          projectRoot,
          environment: { PROXY_KEY: 'proxy-key' },
          modelOverride: 'override-model',
        }),
      ).resolves.toMatchObject({
        profileName: 'proxy',
        runtime: { model: 'override-model' },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('uses a configured OpenAI model without an override', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runtime-'));

    try {
      await initializeProject(projectRoot);
      await addModelProfile(projectRoot, {
        name: 'configured',
        kind: 'openai',
        model: 'configured-model',
        apiKeyEnv: 'CONFIGURED_KEY',
        setDefault: true,
      });

      await expect(
        resolveModelRuntime({
          projectRoot,
          environment: { CONFIGURED_KEY: 'configured-key' },
        }),
      ).resolves.toMatchObject({
        profileName: 'configured',
        runtime: { model: 'configured-model' },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('applies a model override to compatible profiles', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-runtime-'));

    try {
      await initializeProject(projectRoot);
      await addModelProfile(projectRoot, {
        name: 'compatible',
        kind: 'openai-compatible',
        model: 'configured-model',
        baseUrl: 'https://models.example.com',
        apiKeyEnv: 'COMPATIBLE_KEY',
        setDefault: true,
      });

      await expect(
        resolveModelRuntime({
          projectRoot,
          environment: { COMPATIBLE_KEY: 'compatible-key' },
          modelOverride: 'override-model',
        }),
      ).resolves.toMatchObject({
        profileName: 'compatible',
        runtime: { model: 'override-model' },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
