import { mkdir, mkdtemp, open, realpath, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { simpleGit } from 'simple-git';

import { ProjectContextInspector, inspectProject } from '../index.js';
import {
  detectLanguages,
  fileExists,
  readProjectContextDocument,
  readProjectContextDocuments,
} from '../project-context.js';

describe('ProjectContextInspector', () => {
  it('detects a committed TypeScript project and reads bounded planning context', async () => {
    const projectRoot = await createCommittedProject({
      'package.json': JSON.stringify({
        scripts: {
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
          test: 'jest --token sk-super-secret-token',
          build: 'tsc -p tsconfig.build.json',
        },
        dependencies: { react: '^19.0.0' },
        devDependencies: { next: '^16.0.0', vite: '^8.0.0', jest: '^30.0.0' },
      }),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'tsconfig.json': '{}\n',
      'next.config.ts': 'export default {};\n',
      'vite.config.ts': 'export default {};\n',
      'jest.config.ts': 'export default {};\n',
      'src/index.ts': 'export const value = 1;\n',
      'src/component.tsx': 'export const component = true;\n',
      'src/legacy.js': 'export const legacy = true;\n',
      'README.md': '# Fixture project\n',
      'AGENTS.md': '# Agent instructions\n',
      'CONTRIBUTING.md': '# Contributing\n',
      'openspec/config.yaml': 'schema: spec-driven\n',
    });

    try {
      const result = await inspectProject(projectRoot);

      expect(result.profile).toMatchObject({
        repositoryRoot: await realpath(projectRoot),
        packageManager: 'pnpm',
        languages: ['JavaScript', 'TypeScript'],
        frameworks: ['Jest', 'Next.js', 'React', 'Vite'],
        conventionFiles: ['AGENTS.md', 'CONTRIBUTING.md', 'openspec/config.yaml'],
        testConfigFiles: ['jest.config.ts'],
        ambiguities: [],
        requiresConfirmation: false,
        confirmedByUser: false,
      });
      expect(result.profile.git.status).toBe('clean');
      expect(result.profile.packageScripts.test).toContain('[REDACTED]');
      expect(result.profile.packageScripts.test).not.toContain('sk-super-secret-token');
      expect(result.profile.verificationCommands).toHaveLength(4);
      expect(result.documents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'README.md', content: '# Fixture project\n' }),
          expect.objectContaining({ path: 'AGENTS.md', content: '# Agent instructions\n' }),
          expect.objectContaining({ path: 'jest.config.ts', truncated: false }),
        ]),
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('detects supported source languages', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-languages-'));

    try {
      for (const extension of ['py', 'rs', 'go', 'java', 'kt', 'rb', 'php', 'jsx', 'cjs', 'mjs']) {
        await writeFile(path.join(projectRoot, `source.${extension}`), '\n', 'utf8');
      }

      const result = await inspectProject(projectRoot);
      expect(result.profile.languages).toEqual([
        'Go',
        'Java',
        'JavaScript',
        'Kotlin',
        'PHP',
        'Python',
        'Ruby',
        'Rust',
      ]);
      expect(detectLanguages(['unknown.txt'])).toEqual([]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('ProjectContextInspector ambiguity handling', () => {
  it('reports package and command ambiguities without hiding detected scripts', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-ambiguous-'));

    try {
      await writeFile(
        path.join(projectRoot, 'package.json'),
        JSON.stringify({ scripts: { lint: 'eslint .' } }),
        'utf8',
      );
      await writeFile(path.join(projectRoot, 'package-lock.json'), '{}\n', 'utf8');
      await writeFile(path.join(projectRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf8');

      const result = await inspectProject(projectRoot);

      expect(result.profile.packageManager).toBe('unknown');
      expect(result.profile.requiresConfirmation).toBe(true);
      expect(result.profile.ambiguities).toEqual(
        expect.arrayContaining([
          'The project is not initialized as a Git repository.',
          expect.stringContaining('Multiple package manager lockfiles'),
          expect.stringContaining('No typecheck command'),
          expect.stringContaining('No test command'),
          expect.stringContaining('No build command'),
        ]),
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('reports invalid package metadata and missing lockfiles', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-invalid-package-'));

    try {
      await writeFile(path.join(projectRoot, 'package.json'), '{invalid', 'utf8');

      const result = await inspectProject(projectRoot);

      expect(result.profile.packageScripts).toEqual({});
      expect(result.profile.ambiguities).toEqual(
        expect.arrayContaining([
          'package.json could not be parsed or validated.',
          'package.json exists but no supported package manager lockfile was found.',
        ]),
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('propagates package read failures other than a missing file', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-package-error-'));

    try {
      await mkdir(path.join(projectRoot, 'package.json'));

      await expect(inspectProject(projectRoot)).rejects.toThrow();
      await expect(fileExists('\0')).rejects.toThrow();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('accepts package metadata without scripts or dependencies', async () => {
    const projectRoot = await createCommittedProject({
      'package.json': '{}\n',
      'README.md': '# Empty package\n',
    });

    try {
      const result = await inspectProject(projectRoot);

      expect(result.profile.packageScripts).toEqual({});
      expect(result.profile.languages).toEqual([]);
      expect(result.profile.ambiguities).toEqual(
        expect.arrayContaining([
          'package.json exists but no supported package manager lockfile was found.',
        ]),
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('accepts explicit command overrides without package metadata', async () => {
    const projectRoot = await createCommittedProject({
      'README.md': '# Override project\n',
    });

    try {
      const result = await new ProjectContextInspector().inspect(projectRoot, {
        verification: {
          requiredCommands: ['lint', 'typecheck', 'test', 'build'],
          defaultTimeoutMs: 1_000,
          commandOverrides: {
            lint: { command: 'node', args: ['lint.js'] },
            typecheck: { command: 'node', args: ['types.js'] },
            test: { command: 'node', args: ['test.js'] },
            build: { command: 'node', args: ['build.js'] },
          },
        },
      });

      expect(result.profile.packageManager).toBe('unknown');
      expect(result.profile.verificationCommands).toHaveLength(4);
      expect(result.profile.requiresConfirmation).toBe(false);
      await expect(new ProjectContextInspector().inspect(projectRoot)).resolves.toMatchObject({
        profile: { requiresConfirmation: true },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('project context document boundaries', () => {
  it('caps context file reads and rejects paths outside the repository', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-context-read-'));
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-context-outside-'));
    const largeFile = path.join(projectRoot, 'large.md');
    const outsideFile = path.join(outsideRoot, 'secret.md');

    try {
      const handle = await open(largeFile, 'w');
      await handle.close();
      await truncate(largeFile, 70 * 1024);
      await writeFile(outsideFile, 'outside secret\n', 'utf8');
      await symlink(outsideFile, path.join(projectRoot, 'linked.md'));

      const document = await readProjectContextDocument(projectRoot, 'large.md');
      expect(document).toMatchObject({
        path: 'large.md',
        truncated: true,
      });
      expect(Buffer.byteLength(document?.content ?? '')).toBe(64 * 1024);
      await expect(readProjectContextDocument(projectRoot, 'missing.md')).resolves.toBeUndefined();
      await expect(readProjectContextDocument(projectRoot, '../outside.md')).rejects.toThrow(
        'outside the repository root',
      );
      await expect(readProjectContextDocument(projectRoot, 'linked.md')).rejects.toThrow(
        'resolves outside the repository root',
      );
      await expect(readProjectContextDocument(projectRoot, '\0')).rejects.toThrow();
      await expect(
        readProjectContextDocuments(projectRoot, ['missing-document.md']),
      ).resolves.toEqual([]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });
});

async function createCommittedProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'bossflow-context-'));
  for (const [fileName, content] of Object.entries(files)) {
    const filePath = path.join(projectRoot, fileName);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }

  const git = simpleGit(projectRoot);
  await git.init(['--initial-branch=main']);
  await git.raw(['config', 'user.name', 'BossFlow Test']);
  await git.raw(['config', 'user.email', 'bossflow@example.com']);
  await git.add(['--all']);
  await git.commit('Initial commit');
  return projectRoot;
}
