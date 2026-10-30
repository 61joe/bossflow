import { chmod, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { initializeProject, loadConfig } from '../../config/index.js';
import {
  addModelProfile,
  clearStoredApiKey,
  getModelProfile,
  resolveCredential,
  writeStoredApiKey,
} from '../index.js';

describe('model credentials', () => {
  it('prefers environment credentials over the local credentials file', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-credentials-'));

    try {
      await initializeProject(projectRoot);
      await addLocalProfile(projectRoot);
      await writeStoredApiKey(projectRoot, 'local', 'file-secret');

      const config = await loadConfig(projectRoot);
      const selectedProfile = getModelProfile(config);
      const credential = await resolveCredential(projectRoot, 'local', selectedProfile.profile, {
        LOCAL_MODEL_API_KEY: 'environment-secret',
      });

      expect(credential).toEqual({
        source: 'environment',
        envName: 'LOCAL_MODEL_API_KEY',
        apiKey: 'environment-secret',
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('stores local credentials with owner-only permissions and can clear them', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-credentials-'));
    const credentialsPath = path.join(projectRoot, '.bossflow', 'credentials.local.yaml');

    try {
      await initializeProject(projectRoot);
      await writeStoredApiKey(projectRoot, 'openai', 'local-secret');

      const credentialsStat = await stat(credentialsPath);
      expect(credentialsStat.mode & 0o777).toBe(0o600);

      const config = await loadConfig(projectRoot);
      const selectedProfile = getModelProfile(config);
      const credential = await resolveCredential(
        projectRoot,
        'openai',
        selectedProfile.profile,
        {},
      );
      expect(credential).toMatchObject({
        source: 'local-file',
        apiKey: 'local-secret',
      });

      await expect(clearStoredApiKey(projectRoot, 'openai')).resolves.toBe(true);
      await expect(stat(credentialsPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects a credentials file readable by other users', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-credentials-'));
    const credentialsPath = path.join(projectRoot, '.bossflow', 'credentials.local.yaml');

    try {
      await initializeProject(projectRoot);
      await writeStoredApiKey(projectRoot, 'openai', 'local-secret');
      await chmod(credentialsPath, 0o644);

      const config = await loadConfig(projectRoot);
      const selectedProfile = getModelProfile(config);
      await expect(
        resolveCredential(projectRoot, 'openai', selectedProfile.profile, {}),
      ).rejects.toThrow('Unable to read the local BossFlow credentials file.');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

async function addLocalProfile(projectRoot: string): Promise<void> {
  await addModelProfile(projectRoot, {
    name: 'local',
    kind: 'openai-compatible',
    model: 'coding-model',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyEnv: 'LOCAL_MODEL_API_KEY',
    setDefault: true,
  });
}
