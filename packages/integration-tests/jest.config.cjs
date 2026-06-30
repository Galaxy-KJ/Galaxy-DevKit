const { createDefaultPreset } = require('ts-jest');

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  displayName: 'integration',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: {
    ...tsJestTransformCfg,
  },
  transformIgnorePatterns: ['node_modules/(?!(@stellar|@blend-capital)/)'],
  moduleNameMapper: {
    '^(\\.\\.?/.*)\\.js$': '$1',
  },
};
