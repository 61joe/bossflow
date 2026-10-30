import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/.bossflow/**',
      '**/.agents/**',
      '**/.codex/**',
      'pnpm-lock.yaml',
    ],
  },
  {
    ...js.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      complexity: ['warn', 12],
      curly: ['error', 'all'],
      eqeqeq: 'error',
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', 120],
      'max-lines': ['warn', 400],
      'no-console': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['**/__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  eslintConfigPrettier,
);
