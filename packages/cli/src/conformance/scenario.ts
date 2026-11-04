import type { ConformanceScenario, ConformanceScenarioId } from './types.js';

const SINGLE_PACKAGE_SCRIPTS = {
  lint: 'node --check src/index.js',
  typecheck: 'node --check src/index.js',
  test: 'node scripts/verify.mjs',
  build: 'node scripts/verify.mjs',
} as const;
const MULTI_PACKAGE_SCRIPTS = {
  lint: 'node --check packages/app/src/index.js && ' + 'node --check packages/lib/src/index.js',
  typecheck:
    'node --check packages/app/src/index.js && ' + 'node --check packages/lib/src/index.js',
  test: 'node scripts/verify.mjs',
  build: 'node scripts/verify.mjs',
} as const;

export const CONFORMANCE_SCENARIOS: readonly ConformanceScenario[] = [
  {
    id: 'single-js-export',
    projectProfile: 'single-package-javascript',
    packageManager: 'pnpm',
    languages: ['JavaScript'],
    goal:
      "Add `export const conformanceExport = 'ready';` to src/index.js. Modify only " +
      'src/index.js and do not change package scripts or dependencies.',
    expectedChangedPath: 'src/index.js',
    files: {
      '.gitignore': '.bossflow/\n',
      'README.md': '# Single-package JavaScript conformance fixture\n',
      'package.json': packageJson('bossflow-conformance-single', SINGLE_PACKAGE_SCRIPTS),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'scripts/verify.mjs':
        "import { conformanceExport } from '../src/index.js';\n\n" +
        "if (conformanceExport !== 'ready') {\n" +
        '  throw new Error(`Unexpected conformance export: ${String(conformanceExport)}`);\n' +
        '}\n\n' +
        'process.stdout.write(`conformanceExport=${conformanceExport}\\n`);\n',
      'src/index.js': 'export const fixture = true;\n',
    },
  },
  {
    id: 'single-js-function',
    projectProfile: 'single-package-javascript',
    packageManager: 'pnpm',
    languages: ['JavaScript'],
    goal:
      'Add `export function addNumbers(left, right) { return left + right; }` to ' +
      'src/math.js. Modify only src/math.js and do not change package scripts or dependencies.',
    expectedChangedPath: 'src/math.js',
    files: {
      '.gitignore': '.bossflow/\n',
      'README.md': '# Single-package function conformance fixture\n',
      'package.json': packageJson('bossflow-conformance-function', SINGLE_PACKAGE_SCRIPTS),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'scripts/verify.mjs':
        "import { addNumbers } from '../src/math.js';\n\n" +
        'const sum = addNumbers(2, 3);\n' +
        'if (sum !== 5) {\n' +
        '  throw new Error(`Unexpected sum: ${String(sum)}`);\n' +
        '}\n\n' +
        'process.stdout.write(`addNumbers=${sum}\\n`);\n',
      'src/index.js': 'export const fixture = true;\n',
      'src/math.js': 'export const mathFixture = true;\n',
    },
  },
  {
    id: 'multi-package-js-export',
    projectProfile: 'multi-package-javascript',
    packageManager: 'pnpm',
    languages: ['JavaScript'],
    goal:
      "Add `export const multiPackageExport = 'ready';` to packages/app/src/index.js. " +
      'Modify only packages/app/src/index.js and do not change package scripts or dependencies.',
    expectedChangedPath: 'packages/app/src/index.js',
    files: {
      '.gitignore': '.bossflow/\n',
      'README.md': '# Multi-package JavaScript conformance fixture\n',
      'package.json': packageJson('bossflow-conformance-workspace', MULTI_PACKAGE_SCRIPTS),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'scripts/verify.mjs':
        "import { multiPackageExport } from '../packages/app/src/index.js';\n\n" +
        "if (multiPackageExport !== 'ready') {\n" +
        '  throw new Error(`Unexpected multi-package export: ${String(multiPackageExport)}`);\n' +
        '}\n\n' +
        'process.stdout.write(`multiPackageExport=${multiPackageExport}\\n`);\n',
      'packages/app/package.json': packageJson('conformance-app', {}),
      'packages/app/src/index.js': 'export const appFixture = true;\n',
      'packages/lib/package.json': packageJson('conformance-lib', {}),
      'packages/lib/src/index.js': 'export const libFixture = true;\n',
    },
  },
];

export function getConformanceScenario(scenarioId: ConformanceScenarioId): ConformanceScenario {
  const scenario = CONFORMANCE_SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (scenario === undefined) {
    throw new Error(`Unknown conformance scenario "${scenarioId}".`);
  }
  return scenario;
}

function packageJson(name: string, scripts: Readonly<Record<string, string>>): string {
  return `${JSON.stringify({ name, private: true, type: 'module', scripts }, null, 2)}\n`;
}
