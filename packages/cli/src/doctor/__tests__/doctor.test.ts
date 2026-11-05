/* eslint-disable max-lines-per-function -- Doctor scenarios share one temporary repository fixture. */
import { execFile } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { initializeProject } from '../../config/index.js';
import { isWritableDirectoryOrCreatable } from '../doctor.js';
import { inspectDoctor } from '../index.js';

describe('inspectDoctor', () => {
  it('reports a project without configuration', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-doctor-'));

    try {
      await expect(inspectDoctor(projectRoot)).resolves.toMatchObject({
        nodeVersion: process.version,
        configFound: false,
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports the selected model profile and credential source', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-doctor-'));
    const environmentKey = process.env.OPENAI_API_KEY;

    try {
      process.env.OPENAI_API_KEY = 'doctor-key';
      await initializeProject(projectRoot);

      await expect(inspectDoctor(projectRoot)).resolves.toMatchObject({
        configFound: true,
        modelProfileName: 'openai',
        credentialSource: 'environment',
        credentialEnvName: 'OPENAI_API_KEY',
      });
    } finally {
      if (environmentKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = environmentKey;
      }
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports run readiness without creating the Worktree root', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-doctor-'));
    const environmentKey = process.env.OPENAI_API_KEY;

    try {
      process.env.OPENAI_API_KEY = 'doctor-secret';
      await createReadyRepository(projectRoot);
      const worktreeRoot = path.join(path.dirname(projectRoot), '.bossflow-worktrees');
      const worktreeRootExisted = await pathExists(worktreeRoot);

      const report = await inspectDoctor(projectRoot, { runPreflight: true });
      expect(report).toMatchObject({
        preflight: {
          status: 'ready',
          checks: expect.arrayContaining([
            expect.objectContaining({ id: 'node', passed: true }),
            expect.objectContaining({ id: 'config', passed: true }),
            expect.objectContaining({ id: 'credential', passed: true }),
            expect.objectContaining({ id: 'git', passed: true }),
            expect.objectContaining({ id: 'package', passed: true }),
            expect.objectContaining({ id: 'worktree-root', passed: true }),
          ]),
        },
      });
      expect(JSON.stringify(report)).not.toContain('doctor-secret');
      expect(await pathExists(worktreeRoot)).toBe(worktreeRootExisted);
    } finally {
      if (environmentKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = environmentKey;
      }
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports every local readiness failure without modifying the repository', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-doctor-'));
    const environmentKey = process.env.OPENAI_API_KEY;

    try {
      delete process.env.OPENAI_API_KEY;
      await writeFile(
        path.join(projectRoot, 'package.json'),
        JSON.stringify({ scripts: { test: 'node --test' } }),
        'utf8',
      );
      const report = await inspectDoctor(projectRoot, { runPreflight: true });
      expect(report).toMatchObject({
        preflight: {
          status: 'not-ready',
          checks: expect.arrayContaining([
            expect.objectContaining({ id: 'config', passed: false, remedy: expect.any(String) }),
            expect.objectContaining({ id: 'credential', passed: false }),
            expect.objectContaining({ id: 'git', passed: false }),
            expect.objectContaining({ id: 'package', passed: false }),
            expect.objectContaining({ id: 'worktree-root', passed: false }),
          ]),
        },
      });
      await expect(
        access(path.join(projectRoot, '.bossflow', 'credentials.local.yaml')),
      ).rejects.toThrow();
    } finally {
      if (environmentKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = environmentKey;
      }
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports unsupported Node.js and project inspection failures', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-doctor-'));
    const environmentKey = process.env.OPENAI_API_KEY;

    try {
      process.env.OPENAI_API_KEY = 'doctor-secret';
      await initializeProject(projectRoot);
      const unsupported = await inspectDoctor(projectRoot, {
        runPreflight: true,
        nodeVersion: 'v20.14.0',
      });
      expect(unsupported.preflight).toMatchObject({
        status: 'not-ready',
        checks: expect.arrayContaining([
          expect.objectContaining({
            id: 'node',
            passed: false,
            remedy: 'Switch to Node.js 24 or newer.',
          }),
        ]),
      });

      const failedInspection = await inspectDoctor(projectRoot, {
        runPreflight: true,
        projectInspector: async () => {
          throw new Error('corrupt repository');
        },
      });
      expect(failedInspection.preflight).toMatchObject({
        status: 'not-ready',
        checks: expect.arrayContaining([
          expect.objectContaining({
            id: 'inspection',
            passed: false,
            detail: expect.stringContaining('corrupt repository'),
          }),
        ]),
      });
      const emptyInspection = await inspectDoctor(projectRoot, {
        runPreflight: true,
        projectInspector: async () => {
          throw new Error('');
        },
      });
      expect(emptyInspection.preflight).toMatchObject({
        checks: expect.arrayContaining([
          expect.objectContaining({
            id: 'inspection',
            detail: 'Project inspection failed without a diagnostic.',
          }),
        ]),
      });
    } finally {
      if (environmentKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = environmentKey;
      }
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects a non-directory or non-writable Worktree root', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'bossflow-doctor-root-'));
    const projectRoot = path.join(parent, 'project');
    const environmentKey = process.env.OPENAI_API_KEY;

    try {
      process.env.OPENAI_API_KEY = 'doctor-secret';
      await mkdir(projectRoot);
      await createReadyRepository(projectRoot);
      const worktreeRoot = path.join(parent, '.bossflow-worktrees');
      await writeFile(worktreeRoot, 'not a directory', 'utf8');
      const notDirectory = await inspectDoctor(projectRoot, { runPreflight: true });
      expect(notDirectory.preflight).toMatchObject({
        status: 'not-ready',
        checks: expect.arrayContaining([
          expect.objectContaining({ id: 'worktree-root', passed: false }),
        ]),
      });

      await rm(worktreeRoot, { force: true });
      await chmod(parent, 0o500);
      const notWritable = await inspectDoctor(projectRoot, { runPreflight: true });
      expect(notWritable.preflight).toMatchObject({
        status: 'not-ready',
        checks: expect.arrayContaining([
          expect.objectContaining({ id: 'worktree-root', passed: false }),
        ]),
      });
    } finally {
      await chmod(parent, 0o700);
      if (environmentKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = environmentKey;
      }
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('requires both write and execute permission for a directory', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bossflow-doctor-mode-'));
    try {
      await chmod(directory, 0o200);
      await expect(isWritableDirectoryOrCreatable(directory)).resolves.toBe(false);
    } finally {
      await chmod(directory, 0o700);
      await rm(directory, { recursive: true, force: true });
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
  await initializeProject(projectRoot);
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

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
