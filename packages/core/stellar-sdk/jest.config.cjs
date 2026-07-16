module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/test/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: false,
        skipLibCheck: true,
        ignoreDeprecations: '5.0',
      },
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/types/**',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  restoreMocks: true,
  moduleNameMapper: {
    '^bip39$': '<rootDir>/src/test/__mocks__/bip39.js',
    '^ed25519-hd-key$': '<rootDir>/src/test/__mocks__/ed25519-hd-key.js',
    // Resolve relative .js imports to .ts (ESM-style imports in TS source)
    '^(\\.\\.?/.*)\\.js$': '$1',
  }
};
