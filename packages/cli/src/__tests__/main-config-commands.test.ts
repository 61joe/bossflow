import { jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { main } from './cli-test-runtime.js';

describe('CLI configuration commands', () => {
  it('handles version, help, and invalid command exits', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const originalArgv = process.argv;

    try {
      await expect(main(['node', 'bossflow', '--version'])).resolves.toBe(0);
      await expect(main(['node', 'bossflow', '--help'])).resolves.toBe(0);
      await expect(main(['node', 'bossflow', 'unknown-command'])).rejects.toMatchObject({
        exitCode: 1,
      });
      process.argv = ['node', 'bossflow', '--version'];
      await expect(main()).resolves.toBe(0);
    } finally {
      process.argv = originalArgv;
      stdout.mockRestore();
    }
  });

  it('runs doctor before and after project initialization', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-config-'));
    const originalCwd = process.cwd();
    const originalKey = process.env.OPENAI_API_KEY;
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      process.chdir(projectRoot);
      delete process.env.OPENAI_API_KEY;
      await main(['node', 'bossflow', 'doctor']);
      expect(stdout).toHaveBeenCalledWith('Config: missing\n');

      await main(['node', 'bossflow', 'init']);
      await main(['node', 'bossflow', 'init']);
      process.env.OPENAI_API_KEY = 'doctor-key';
      await main(['node', 'bossflow', 'doctor']);

      expect(stdout).toHaveBeenCalledWith('Config: found\n');
      expect(stdout).toHaveBeenCalledWith('Credential: environment variable OPENAI_API_KEY\n');
    } finally {
      process.chdir(originalCwd);
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
      stdout.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
