import { jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { main } from './cli-test-runtime.js';

describe('CLI stdin auth commands', () => {
  it('reads Buffer and string stdin values and clears credentials', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-auth-'));
    const originalCwd = process.cwd();
    const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      process.chdir(projectRoot);
      await main(['node', 'bossflow', 'init']);

      replaceStdin(Readable.from([Buffer.from('buffer-key\n')]));
      await main(['node', 'bossflow', 'auth', 'set', 'openai', '--stdin']);
      await main(['node', 'bossflow', 'auth', 'clear', 'openai']);

      replaceStdin(Readable.from(['string-key\n']));
      await main(['node', 'bossflow', 'auth', 'set', 'openai', '--stdin']);
      await main(['node', 'bossflow', 'auth', 'clear', 'openai']);
      await main(['node', 'bossflow', 'auth', 'clear', 'openai']);

      expect(stdout).toHaveBeenCalledWith('Local credential removed for model profile "openai".\n');
      expect(stdout).toHaveBeenCalledWith(
        'No local credential stored for model profile "openai".\n',
      );
    } finally {
      process.chdir(originalCwd);
      restoreStdin(originalStdin);
      stdout.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects stdin mode on a TTY and unknown profiles', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-auth-'));
    const originalCwd = process.cwd();
    const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      process.chdir(projectRoot);
      await main(['node', 'bossflow', 'init']);
      replaceStdin(Readable.from([]), true);

      await expect(main(['node', 'bossflow', 'auth', 'set', 'openai', '--stdin'])).rejects.toThrow(
        'requires redirected input',
      );
      await expect(main(['node', 'bossflow', 'auth', 'set', 'missing', '--stdin'])).rejects.toThrow(
        'does not exist',
      );
    } finally {
      process.chdir(originalCwd);
      restoreStdin(originalStdin);
      stdout.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

function replaceStdin(stream: Readable, isTTY = false): void {
  Object.defineProperty(stream, 'isTTY', { configurable: true, value: isTTY });
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: stream,
  });
}

function restoreStdin(descriptor: PropertyDescriptor | undefined): void {
  if (descriptor !== undefined) {
    Object.defineProperty(process, 'stdin', descriptor);
  }
}
