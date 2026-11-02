import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { initializeProject, loadConfig } from '../../config/index.js';
import {
  clearStoredApiKey,
  getModelProfile,
  resolveCredential,
  writeStoredApiKey,
} from '../index.js';

describe('credential edge cases', () => {
  it('uses profile-specific fallback environment names', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-credentials-edge-'));

    try {
      await initializeProject(projectRoot);
      const config = await loadConfig(projectRoot);
      const openaiProfile = getModelProfile(config);
      const compatibleProfile = {
        kind: 'openai-compatible' as const,
        model: 'compatible-model',
        baseUrl: 'https://models.example.com',
      };

      await expect(
        resolveCredential(projectRoot, openaiProfile.name, openaiProfile.profile, {
          OPENAI_API_KEY: 'openai-key',
        }),
      ).resolves.toMatchObject({ source: 'environment', envName: 'OPENAI_API_KEY' });
      await expect(
        resolveCredential(projectRoot, 'compatible', compatibleProfile, {
          BOSSFLOW_MODEL_API_KEY: 'compatible-key',
        }),
      ).resolves.toMatchObject({ source: 'environment', envName: 'BOSSFLOW_MODEL_API_KEY' });
      await expect(
        resolveCredential(
          projectRoot,
          'unconfigured-openai',
          { kind: 'openai' },
          { OPENAI_API_KEY: 'fallback-openai-key' },
        ),
      ).resolves.toMatchObject({ source: 'environment', envName: 'OPENAI_API_KEY' });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('keeps remaining credentials and reports absent credentials', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-credentials-edge-'));
    const credentialsPath = path.join(projectRoot, '.bossflow', 'credentials.local.yaml');

    try {
      await initializeProject(projectRoot);
      await writeStoredApiKey(projectRoot, 'first', 'first-key');
      await writeStoredApiKey(projectRoot, 'second', 'second-key');

      await expect(clearStoredApiKey(projectRoot, 'first')).resolves.toBe(true);
      expect(await readFile(credentialsPath, 'utf8')).toContain('second');
      await expect(clearStoredApiKey(projectRoot, 'missing')).resolves.toBe(false);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects empty keys, non-file paths, invalid YAML, and non-ENOENT errors', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-credentials-edge-'));
    const credentialsPath = path.join(projectRoot, '.bossflow', 'credentials.local.yaml');

    try {
      await initializeProject(projectRoot);
      await expect(writeStoredApiKey(projectRoot, 'openai', '   ')).rejects.toThrow();

      await mkdir(credentialsPath);
      const config = await loadConfig(projectRoot);
      const profile = getModelProfile(config);
      await expect(resolveCredential(projectRoot, 'openai', profile.profile, {})).rejects.toThrow(
        'Unable to read',
      );
      await rm(credentialsPath, { recursive: true, force: true });

      await writeFile(credentialsPath, 'invalid: [', { mode: 0o600 });
      await chmod(credentialsPath, 0o600);
      await expect(resolveCredential(projectRoot, 'openai', profile.profile, {})).rejects.toThrow(
        'Unable to read',
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('skips POSIX permission checks on Windows', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-credentials-edge-'));
    const credentialsPath = path.join(projectRoot, '.bossflow', 'credentials.local.yaml');
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');

    try {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: 'win32',
      });
      await initializeProject(projectRoot);
      await writeStoredApiKey(projectRoot, 'openai', 'windows-key');
      await chmod(credentialsPath, 0o644);
      const config = await loadConfig(projectRoot);
      const profile = getModelProfile(config);

      await expect(
        resolveCredential(projectRoot, 'openai', profile.profile, {}),
      ).resolves.toMatchObject({ source: 'local-file' });
    } finally {
      if (platform !== undefined) {
        Object.defineProperty(process, 'platform', platform);
      }
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
