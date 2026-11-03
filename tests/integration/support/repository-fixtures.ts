import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runGit } from './git-command.js';
import type { RepositoryFixture, RepositoryFixtureScenario } from './types.js';

const SUCCESS_SCRIPTS = {
  lint: 'node -e "process.exit(0)"',
  typecheck: 'node -e "process.exit(0)"',
  test: 'node -e "process.exit(0)"',
  build: 'node -e "process.exit(0)"',
} as const;

export async function createRepositoryFixture(
  scenario: RepositoryFixtureScenario,
): Promise<RepositoryFixture> {
  const root = await mkdtemp(path.join(tmpdir(), `bossflow-fixture-${scenario}-`));
  const worktreesRoot = await mkdtemp(
    path.join(tmpdir(), `bossflow-fixture-${scenario}-worktrees-`),
  );
  await writeFixtureFiles(root, createFixtureFiles(scenario));
  await commitFixture(root);
  if (scenario === 'dirty') {
    await writeFile(path.join(root, 'dirty.txt'), 'uncommitted change\n', 'utf8');
  }

  return {
    root,
    worktreesRoot,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
      await rm(worktreesRoot, { recursive: true, force: true });
    },
  };
}

function createFixtureFiles(scenario: RepositoryFixtureScenario): Readonly<Record<string, string>> {
  const baseFiles = {
    '.gitignore': '.bossflow/\n',
    'README.md': `# ${scenario} fixture\n`,
    'src/index.ts': 'export const fixture = true;\n',
  } as const;

  switch (scenario) {
    case 'clean':
      return {
        ...baseFiles,
        'package.json': packageJson('clean-fixture', SUCCESS_SCRIPTS),
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      };
    case 'dirty':
      return {
        ...baseFiles,
        'package.json': packageJson('dirty-fixture', SUCCESS_SCRIPTS),
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      };
    case 'multi-package':
      return {
        ...baseFiles,
        'package.json': packageJson('multi-package-fixture', SUCCESS_SCRIPTS),
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'packages/app/package.json': packageJson('fixture-app', {
          test: SUCCESS_SCRIPTS.test,
        }),
        'packages/app/src/index.ts': 'export const app = true;\n',
        'packages/lib/package.json': packageJson('fixture-lib', {
          build: SUCCESS_SCRIPTS.build,
        }),
        'packages/lib/src/index.ts': 'export const library = true;\n',
      };
    case 'missing-command':
      return {
        ...baseFiles,
        'package.json': packageJson('missing-command-fixture', {
          lint: SUCCESS_SCRIPTS.lint,
        }),
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      };
    case 'failing-verification':
      return {
        ...baseFiles,
        'package.json': packageJson('failing-verification-fixture', {
          ...SUCCESS_SCRIPTS,
          test: 'node -e "process.exit(1)"',
        }),
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      };
  }
}

function packageJson(name: string, scripts: Readonly<Record<string, string>>): string {
  return `${JSON.stringify({ name, private: true, scripts }, null, 2)}\n`;
}

async function writeFixtureFiles(
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [fileName, content] of Object.entries(files)) {
    const filePath = path.join(root, fileName);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }
}

async function commitFixture(root: string): Promise<void> {
  await runGit(root, ['init', '--initial-branch=main']);
  await runGit(root, ['config', 'user.name', 'BossFlow Test']);
  await runGit(root, ['config', 'user.email', 'bossflow@example.com']);
  await runGit(root, ['add', '--all']);
  await runGit(root, ['commit', '-m', 'fixture: initialize repository']);
}
