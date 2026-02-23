/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  globals: {
    'ts-jest': {
      tsconfig: './tsconfig.json',
    },
  },
  testMatch: [
    // Matches the actual layout visible in the screenshot:
    // packages/core/wallet/auth/src/tests/*.test.ts
    '<rootDir>/src/tests/**/*.test.ts',
    // Also match tests alongside source files (future-proof)
    '<rootDir>/src/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/tests/**',
  ],
  clearMocks: true,
  restoreMocks: true,
};

module.exports = config;