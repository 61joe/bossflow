import { jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { main, setAgentOutput } from './cli-test-runtime.js';

describe('CLI model commands', () => {
  it('adds, lists, tests, selects, and removes profiles', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-model-'));
    const originalCwd = process.cwd();
    const originalProxyKey = process.env.PROXY_KEY;
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
      await main(['node', 'bossflow', 'model', 'add', 'minimal', '--kind', 'openai']);
      await main([
        'node',
        'bossflow',
        'model',
        'add',
        'proxy',
        '--model',
        'proxy-model',
        '--base-url',
        'https://proxy.example.com',
        '--api-key-env',
        'PROXY_KEY',
        '--chat-completions',
      ]);
      await main(['node', 'bossflow', 'model', 'list']);
      await main(['node', 'bossflow', 'model', 'use', 'proxy']);

      process.env.PROXY_KEY = 'proxy-key';
      setAgentOutput({ status: 'ok', message: 'connected' });
      await main(['node', 'bossflow', 'model', 'test', 'proxy']);
      await main(['node', 'bossflow', 'model', 'remove', 'local']);

      expect(stdout).toHaveBeenCalledWith(expect.stringContaining('Model probe succeeded'));
      expect(stdout).toHaveBeenCalledWith('Model profile "local" removed.\n');
    } finally {
      if (originalProxyKey === undefined) {
        delete process.env.PROXY_KEY;
      } else {
        process.env.PROXY_KEY = originalProxyKey;
      }
      process.chdir(originalCwd);
      stdout.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects unsupported model kinds', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-model-'));
    const originalCwd = process.cwd();

    try {
      process.chdir(projectRoot);
      await main(['node', 'bossflow', 'init']);
      await expect(
        main(['node', 'bossflow', 'model', 'add', 'invalid', '--kind', 'unsupported']),
      ).rejects.toThrow('Model kind must be');
    } finally {
      process.chdir(originalCwd);
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
