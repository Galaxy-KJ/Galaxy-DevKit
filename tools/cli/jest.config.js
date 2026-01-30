export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@galaxy/core/(.*)$': '<rootDir>/packages/core/$1/src',
    '^@galaxy/contracts/(.*)$': '<rootDir>/packages/contracts/$1/src',
    '^@galaxy/api/(.*)$': '<rootDir>/packages/api/$1/src',
    '^@galaxy/sdk/(.*)$': '<rootDir>/packages/sdk/$1/src',
    '^@galaxy/templates/(.*)$': '<rootDir>/packages/templates/$1/src',
    '^@galaxy/tools/(.*)$': '<rootDir>/tools/$1/src'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true
        }
      }
    ]
  },
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
  roots: ['<rootDir>/packages', '<rootDir>/tools'],
  verbose: true,
  testTimeout: 30000
};
