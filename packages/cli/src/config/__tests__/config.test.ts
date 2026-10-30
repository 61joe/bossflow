import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { initializeProject, loadConfig } from '../index.js';

describe('project config', () => {
  it('initializes and reloads a valid config', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-project-'));

    try {
      await expect(initializeProject(projectRoot)).resolves.toBe('created');
      await expect(initializeProject(projectRoot)).resolves.toBe('exists');

      const config = await loadConfig(projectRoot);
      expect(config).toMatchObject({
        schemaVersion: 1,
        workflow: {
          initialStage: 'spec',
          runDirectory: '.bossflow/runs',
        },
        models: {
          defaultProfile: 'openai',
          profiles: {
            openai: {
              kind: 'openai',
              apiKeyEnv: 'OPENAI_API_KEY',
            },
          },
        },
      });

      const rawConfig = await readFile(path.join(projectRoot, '.bossflow', 'config.yaml'), 'utf8');
      expect(rawConfig).toContain('schemaVersion: 1');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
