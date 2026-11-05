import { jest } from '@jest/globals';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { main } from '../index.js';

describe('CLI adapter commands', () => {
  it('lists adapter installation in top-level help', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      await expect(main(['node', 'bossflow', '--help'])).resolves.toBe(0);
      expect(stdout).toHaveBeenCalledWith(expect.stringContaining('adapter'));
    } finally {
      stdout.mockRestore();
    }
  });

  it('installs the Codex Skill into the current project idempotently', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-cli-adapter-'));
    const canonicalRoot = await realpath(projectRoot);
    const skillPath = path.join(canonicalRoot, '.agents', 'skills', 'bossflow', 'SKILL.md');
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const originalCwd = process.cwd();

    try {
      process.chdir(projectRoot);
      await expect(main(['node', 'bossflow', 'adapter', 'install', 'codex'])).resolves.toBe(0);
      expect(stdout).toHaveBeenCalledWith(`Installed Codex Desktop integration: ${skillPath}\n`);
      await expect(readFile(skillPath, 'utf8')).resolves.toContain('# BossFlow');

      await expect(main(['node', 'bossflow', 'adapter', 'install', 'codex'])).resolves.toBe(0);
      expect(stdout).toHaveBeenCalledWith(
        `Codex Desktop integration is already installed: ${skillPath}\n`,
      );
    } finally {
      process.chdir(originalCwd);
      stdout.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('requires explicit overwrite for a different Skill in a target project', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-cli-adapter-conflict-'));
    const canonicalRoot = await realpath(projectRoot);
    const skillPath = path.join(canonicalRoot, '.agents', 'skills', 'bossflow', 'SKILL.md');
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, 'custom skill\n', 'utf8');
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      await expect(
        main(['node', 'bossflow', 'adapter', 'install', 'codex', '--project', projectRoot]),
      ).resolves.toBe(8);
      expect(stderr).toHaveBeenCalledWith(
        `A different Codex Desktop integration already exists at "${skillPath}".\n`,
      );
      await expect(readFile(skillPath, 'utf8')).resolves.toBe('custom skill\n');

      await expect(
        main([
          'node',
          'bossflow',
          'adapter',
          'install',
          'codex',
          '--project',
          projectRoot,
          '--overwrite',
        ]),
      ).resolves.toBe(0);
      await expect(readFile(skillPath, 'utf8')).resolves.toContain('# BossFlow');
      expect(stdout).toHaveBeenCalledWith(`Installed Codex Desktop integration: ${skillPath}\n`);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects unsupported adapters', async () => {
    await expect(main(['node', 'bossflow', 'adapter', 'install', 'unknown'])).resolves.toBe(2);
  });
});
