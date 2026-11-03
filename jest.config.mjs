/** @type {import('jest').Config} */
export default {
  collectCoverageFrom: [
    'packages/**/src/**/*.ts',
    '!packages/**/src/**/__tests__/**',
    '!packages/**/src/**/index.ts',
    '!packages/cli/src/bin.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@bossflow/core$': '<rootDir>/packages/core/src/index.ts',
    '^@bossflow/adapters$': '<rootDir>/packages/adapters/src/index.ts',
    '^@bossflow/cli$': '<rootDir>/packages/cli/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  roots: ['<rootDir>/packages', '<rootDir>/tests'],
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/tests/integration/**/*.test.ts'],
  testTimeout: 10000,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
        useESM: true,
      },
    ],
  },
};
