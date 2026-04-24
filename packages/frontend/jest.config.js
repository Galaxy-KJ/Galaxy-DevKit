module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@galaxy-kj/core-wallet$': '<rootDir>/../core/wallet/src/smart-wallet.service.ts',
  },
};
