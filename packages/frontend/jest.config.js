module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/index.ts',
    '!src/__tests__/**',
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
  },
};
