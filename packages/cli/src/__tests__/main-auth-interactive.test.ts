import { jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { main, passwordMock } from './cli-test-runtime.js';

describe('CLI interactive auth commands', () => {
  it('stores an interactive credential and reports each credential source', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-auth-'));
    const originalCwd = process.cwd();
    const originalLocalKey = process.env.LOCAL_KEY;
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

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
        'compatible-model',
        '--base-url',
        'https://models.example.com',
        '--api-key-env',
        'LOCAL_KEY',
        '--default',
      ]);

      passwordMock.mockResolvedValue('interactive-key');
      await main(['node', 'bossflow', 'auth', 'set', 'local']);
      process.env.LOCAL_KEY = 'environment-key';
      await main(['node', 'bossflow', 'auth', 'status']);

      expect(passwordMock).toHaveBeenCalledWith({
        message: 'API key for model profile "local"',
      });
      expect(stdout).toHaveBeenCalledWith('local: environment variable LOCAL_KEY\n');
      expect(stdout).toHaveBeenCalledWith(
        'openai: missing (set OPENAI_API_KEY or run "bossflow auth set <profile>")\n',
      );
    } finally {
      if (originalLocalKey === undefined) {
        delete process.env.LOCAL_KEY;
      } else {
        process.env.LOCAL_KEY = originalLocalKey;
      }
      process.chdir(originalCwd);
      stdout.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports a credential loaded from the local file', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-auth-'));
    const originalCwd = process.cwd();
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      process.chdir(projectRoot);
      await main(['node', 'bossflow', 'init']);
      passwordMock.mockResolvedValue('local-key');
      await main(['node', 'bossflow', 'auth', 'set', 'openai']);
      await main(['node', 'bossflow', 'auth', 'status']);

      expect(stdout).toHaveBeenCalledWith(
        'openai: .bossflow/credentials.local.yaml (OPENAI_API_KEY can override it)\n',
      );
    } finally {
      process.chdir(originalCwd);
      stdout.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
