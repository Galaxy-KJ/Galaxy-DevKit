export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@galaxy/core/(.*)$': '<rootDir>/packages/core/$1/src',
    '^@galaxy/contracts/(.*)$': '<rootDir>/packages/contracts/$1/src',
    '^@galaxy/api/(.*)$': '<rootDir>/packages/api/$1/src',
    '^@galaxy/sdk/(.*)$': '<rootDir>/packages/sdk/$1/src',
    '^@galaxy/templates/(.*)$': '<rootDir>/packages/templates/$1/src',
    '^@galaxy/tools/(.*)$': '<rootDir>/tools/$1/src',
    // Resolve relative .js imports to .ts (ESM-style imports in source)
    '^(\\.\\.?/.*)\\.js$': '$1',
    // Mock node-cache for tests that load session (e.g. REPL tests)
    '^node-cache$': '<rootDir>/__tests__/__mocks__/node-cache.js',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true
        }
      }
    ]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@stellar)/)'
  ],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'packages/**/src/**/*.ts',
    'tools/**/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  roots: ['<rootDir>'],
  verbose: true,
  testTimeout: 30000
};
