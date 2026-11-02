export const VERIFICATION_COMMAND_KINDS = ['lint', 'typecheck', 'test', 'build'] as const;
export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun', 'unknown'] as const;
export const GIT_WORKTREE_STATUSES = ['clean', 'dirty', 'not-repository'] as const;

export const DEFAULT_VERIFICATION_TIMEOUT_MS = 120_000;
export const MAX_CONTEXT_FILE_BYTES = 64 * 1024;
export const MAX_PROJECT_CONTEXT_FILES = 50;

export const LOCKFILE_PACKAGE_MANAGERS = {
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'yarn.lock': 'yarn',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
} as const;

export const SCRIPT_ALIASES = {
  lint: ['lint', 'lint:check'],
  typecheck: ['typecheck', 'type-check', 'check:types'],
  test: ['test', 'test:unit'],
  build: ['build', 'compile'],
} as const;

export const VERIFICATION_COMMAND_LABELS = {
  lint: 'Lint',
  typecheck: 'Typecheck',
  test: 'Test',
  build: 'Build',
} as const;

export const PACKAGE_MANAGER_RUN_ARGS = {
  pnpm: 'run',
  npm: 'run',
  yarn: 'run',
  bun: 'run',
} as const;

export const FRAMEWORK_DEPENDENCIES = {
  next: 'Next.js',
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  '@angular/core': 'Angular',
  express: 'Express',
  fastify: 'Fastify',
  '@nestjs/core': 'NestJS',
  vite: 'Vite',
  jest: 'Jest',
  vitest: 'Vitest',
} as const;

export const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.rb': 'Ruby',
  '.php': 'PHP',
};

export const CONTEXT_FILE_PATTERNS = [
  'AGENTS.md',
  'README.md',
  'README.*',
  'CONTRIBUTING.md',
  '.editorconfig',
  'openspec/**/*.md',
  'openspec/config.yaml',
] as const;

export const TEST_CONFIG_PATTERNS = [
  'jest.config.{js,cjs,mjs,ts,json}',
  'vitest.config.{js,mjs,ts}',
  'playwright.config.{js,ts}',
  'pytest.ini',
  'tox.ini',
  'Cargo.toml',
  'go.mod',
] as const;

export const PROJECT_SOURCE_PATTERNS = [
  '**/*.{ts,tsx,js,jsx,mjs,cjs,py,rs,go,java,kt,rb,php}',
] as const;

export const PROJECT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.git/**',
  '**/.bossflow/**',
] as const;
