module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/src/tests/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/index.ts',
    '!src/__tests__/**',
    '!src/tests/**',
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  moduleNameMapper: {
    '^@galaxy-kj/core-wallet$': '<rootDir>/../core/wallet/src/index.ts',
    '^@galaxy-kj/core-stellar-sdk$': '<rootDir>/../core/stellar-sdk/src/browser.ts',
    '^@galaxy-kj/core-defi-protocols$': '<rootDir>/../core/defi-protocols/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
};
