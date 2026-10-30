import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadConfig } from '../config/index.js';
import { main } from '../index.js';

describe('model CLI', () => {
  it('treats help output as a successful command', async () => {
    await expect(main(['node', 'bossflow', '--help'])).resolves.toBe(0);
  });

  it('sets a newly added profile as default through the --default flag', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-cli-'));
    const originalCwd = process.cwd();

    try {
      process.chdir(projectRoot);
      await main(['node', 'bossflow', 'init']);
      await main([
        'node',
        'bossflow',
        'model',
        'add',
        'local',
        '--kind',
        'openai-compatible',
        '--model',
        'coding-model',
        '--base-url',
        'http://localhost:11434/v1',
        '--api-key-env',
        'LOCAL_MODEL_API_KEY',
        '--default',
      ]);

      const config = await loadConfig(projectRoot);
      expect(config.models.defaultProfile).toBe('local');
    } finally {
      process.chdir(originalCwd);
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
