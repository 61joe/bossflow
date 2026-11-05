import { jest } from '@jest/globals';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { main } from './cli-test-runtime.js';

describe('CLI configuration commands', () => {
  it('handles version, help, and invalid command exits', async () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const originalArgv = process.argv;

    try {
      await expect(main(['node', 'bossflow', '--version'])).resolves.toBe(0);
      await expect(main(['node', 'bossflow', '--help'])).resolves.toBe(0);
      await expect(main(['node', 'bossflow', 'unknown-command'])).resolves.toBe(2);
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
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      process.chdir(projectRoot);
      delete process.env.OPENAI_API_KEY;
      await main(['node', 'bossflow', 'doctor']);
      expect(stdout).toHaveBeenCalledWith('Config: missing\n');
      await expect(main(['node', 'bossflow', 'doctor', '--run'])).resolves.toBe(1);
      expect(stdout).toHaveBeenCalledWith('Run readiness: not-ready\n');
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining('Configuration: failed - Configuration is missing.'),
      );

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
      stderr.mockRestore();
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports a passing doctor --run preflight', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-main-config-'));
    const originalCwd = process.cwd();
    const originalKey = process.env.OPENAI_API_KEY;
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      process.chdir(projectRoot);
      process.env.OPENAI_API_KEY = 'doctor-key';
      await createReadyRepository(projectRoot);
      await expect(main(['node', 'bossflow', 'doctor', '--run'])).resolves.toBe(0);
      expect(stdout).toHaveBeenCalledWith('Run readiness: ready\n');
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

async function createReadyRepository(projectRoot: string): Promise<void> {
  const run = promisify(execFile);
  await writeFile(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({
      scripts: {
        lint: 'node --check index.js',
        typecheck: 'node --check index.js',
        test: 'node --test',
        build: 'node --check index.js',
      },
    }),
    'utf8',
  );
  await writeFile(path.join(projectRoot, 'package-lock.json'), '{}', 'utf8');
  await writeFile(path.join(projectRoot, 'index.js'), 'export {};\n', 'utf8');
  await main(['node', 'bossflow', 'init']);
  await run('git', ['init'], { cwd: projectRoot });
  await run('git', ['add', '.'], { cwd: projectRoot });
  await run(
    'git',
    [
      '-c',
      'user.name=BossFlow Test',
      '-c',
      'user.email=bossflow@example.test',
      'commit',
      '-m',
      'test fixture',
    ],
    { cwd: projectRoot },
  );
}
