const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  moduleNameMapper: {
    "^@galaxy/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
    "^chalk$": "<rootDir>/tools/cli/__tests__/__mocks__/chalk.ts",
    "^ora$": "<rootDir>/tools/cli/__tests__/__mocks__/ora.ts",
    // Resolve relative .js imports to .ts (ESM-style imports in tools/cli)
    "^(\\.\\.?/.*)\\.js$": "$1",
  },
};
