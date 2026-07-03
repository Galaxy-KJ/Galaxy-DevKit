/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: './tsconfig.test.json',
    }],
  },
  moduleNameMapper: {
    '^@galaxy-kj/core-oracles$': '<rootDir>/../oracles/src/index.ts',
    '^@galaxy-kj/core-stellar-sdk/soroban$': '<rootDir>/../stellar-sdk/src/soroban/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: [
    '**/src/test/**/*.test.ts',
    '**/src/**/*.test.ts',
  ],
};
