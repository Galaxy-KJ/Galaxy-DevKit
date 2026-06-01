const runTestnetIntegration = process.env.GALAXY_TESTNET_INTEGRATION === '1';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globalSetup: '<rootDir>/../test-utils/src/jest-global-setup.ts',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: runTestnetIntegration
    ? []
    : ['<rootDir>/__tests__/integration/'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/types/**',
    '!src/protocols/base-protocol.ts',
    '!src/constants/**',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 88,
      lines: 90,
      statements: 90,
    },
  },
  coverageDirectory: 'coverage',
  // CI reads coverage-summary.json (see .github/workflows/ci.yml)
  coverageReporters: ['text', 'lcov', 'json', 'json-summary'],
  verbose: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
      },
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
};
