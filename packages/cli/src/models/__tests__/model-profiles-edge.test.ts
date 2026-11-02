import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  addModelProfile,
  getModelProfile,
  listModelProfiles,
  removeModelProfile,
  useModelProfile,
} from '../index.js';
import { createDefaultConfig, initializeProject, loadConfig } from '../../config/index.js';

describe('model profile management', () => {
  it('lists sorted profiles and rejects unknown selections', () => {
    const config = createDefaultConfig();
    const profiles = {
      ...config.models.profiles,
      zeta: {
        kind: 'openai' as const,
      },
    };
    const withProfiles = {
      ...config,
      models: {
        defaultProfile: 'openai',
        profiles,
      },
    };

    expect(listModelProfiles(withProfiles).map((summary) => summary.name)).toEqual([
      'openai',
      'zeta',
    ]);
    expect(getModelProfile(withProfiles, 'zeta')).toMatchObject({
      name: 'zeta',
      isDefault: false,
    });
    expect(() => getModelProfile(withProfiles, 'missing')).toThrow('does not exist');
  });

  it('adds OpenAI profiles with default and optional settings', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-profile-edge-'));

    try {
      await initializeProject(projectRoot);
      await addModelProfile(projectRoot, {
        name: 'minimal',
        kind: 'openai',
        setDefault: false,
      });
      await addModelProfile(projectRoot, {
        name: 'configured',
        kind: 'openai',
        model: 'configured-model',
        baseUrl: 'https://proxy.example.com',
        useResponses: false,
        apiKeyEnv: 'CONFIGURED_KEY',
        setDefault: true,
      });

      const config = await loadConfig(projectRoot);
      expect(config.models.profiles.minimal).toEqual({
        kind: 'openai',
        apiKeyEnv: 'OPENAI_API_KEY',
      });
      expect(config.models.profiles.configured).toEqual({
        kind: 'openai',
        model: 'configured-model',
        baseUrl: 'https://proxy.example.com',
        useResponses: false,
        apiKeyEnv: 'CONFIGURED_KEY',
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('validates profile names and compatible profile requirements', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-profile-edge-'));

    try {
      await initializeProject(projectRoot);
      await expect(
        addModelProfile(projectRoot, {
          name: '_invalid',
          kind: 'openai',
          setDefault: false,
        }),
      ).rejects.toThrow('Profile names');
      await expect(
        addModelProfile(projectRoot, {
          name: 'incomplete',
          kind: 'openai-compatible',
          setDefault: false,
        }),
      ).rejects.toThrow('require --model and --base-url');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('uses and removes non-default profiles', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-profile-edge-'));

    try {
      await initializeProject(projectRoot);
      await addModelProfile(projectRoot, {
        name: 'alternate',
        kind: 'openai',
        setDefault: false,
      });
      await useModelProfile(projectRoot, 'alternate');
      expect((await loadConfig(projectRoot)).models.defaultProfile).toBe('alternate');

      await addModelProfile(projectRoot, {
        name: 'removable',
        kind: 'openai',
        setDefault: false,
      });
      await removeModelProfile(projectRoot, 'removable');
      expect((await loadConfig(projectRoot)).models.profiles.removable).toBeUndefined();

      await expect(useModelProfile(projectRoot, 'missing')).rejects.toThrow('does not exist');
      await expect(removeModelProfile(projectRoot, 'missing')).rejects.toThrow('does not exist');
      await expect(removeModelProfile(projectRoot, 'alternate')).rejects.toThrow(
        'Select another default',
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
