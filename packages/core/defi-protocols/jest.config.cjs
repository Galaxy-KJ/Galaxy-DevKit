const runTestnetIntegration = process.env.GALAXY_TESTNET_INTEGRATION === '1';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
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
  coverageReporters: ['text', 'lcov', 'json', 'json-summary'],
  verbose: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: './tsconfig.test.json',
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleDirectories: ['node_modules', '../../node_modules'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
};
