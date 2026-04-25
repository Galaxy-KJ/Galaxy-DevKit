const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/packages/frontend/src/tests/jest.setup.ts"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "\\.e2e\\.test\\.[jt]sx?$",
    "MockLedgerTransport\\.ts$",
    // Jest matches **/__tests__/**/*.ts — exclude helpers and mocks
    "[/\\\\]__tests__[/\\\\]__mocks__[/\\\\]",
    "[/\\\\]__tests__[/\\\\]setup\\.ts$",
  ],
  transform: {
    ...tsJestTransformCfg,
  },
  moduleNameMapper: {
    "^@galaxy/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
    "^@galaxy-kj/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
    "^chalk$": "<rootDir>/tools/cli/__tests__/__mocks__/chalk.ts",
    "^ora$": "<rootDir>/tools/cli/__tests__/__mocks__/ora.ts",
    // Resolve relative .js imports to .ts (ESM-style imports in tools/cli)
    "^(\\.\\.?/.*)\\.js$": "$1",
  },
};
