const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

const runTestnetIntegration = process.env.GALAXY_TESTNET_INTEGRATION === '1';

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  globalSetup: "<rootDir>/packages/core/test-utils/src/jest-global-setup.ts",
  setupFiles: ["<rootDir>/packages/frontend/src/tests/jest.setup.ts"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/e2e/",
    ...(runTestnetIntegration ? [] : ["/integration/"]),
    "\\.e2e\\.test\\.[jt]sx?$",
    "MockLedgerTransport\\.ts$",
    "[/\\\\]__tests__[/\\\\]__mocks__[/\\\\]",
    "[/\\\\]__tests__[/\\\\]setup\\.ts$",
    "[/\\\\]packages[/\\\\]frontend[/\\\\]src[/\\\\]__tests__[/\\\\]mock-webauthn\\.ts$",
  ],
  transform: {
    ...tsJestTransformCfg,
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          allowJs: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@stellar|@galaxy-kj|@blend-capital|@noble|uint8array-extras|execa)/)',
  ],
  moduleNameMapper: {
    "^@galaxy/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
    "^@galaxy-kj/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
    "^@galaxy/core-test-utils$": "<rootDir>/packages/core/test-utils/src/index.ts",
    "^@galaxy-kj/core-test-utils$": "<rootDir>/packages/core/test-utils/src/index.ts",
    "^@galaxy-kj/core-wallet$": "<rootDir>/packages/core/wallet/src/index.ts",
    "^@galaxy-kj/core-stellar-sdk$": "<rootDir>/packages/core/stellar-sdk/src/index.ts",
    "^@galaxy-kj/core-invisible-wallet$": "<rootDir>/packages/core/invisible-wallet/index.ts",
    "^@galaxy-kj/core-invisible-wallet/encryption$": "<rootDir>/packages/core/invisible-wallet/src/utils/encryption.utils.ts",
    "^@galaxy-kj/core-invisible-wallet/(.*)\\.js$": "<rootDir>/packages/core/invisible-wallet/src/$1.ts",
    "^chalk$": "<rootDir>/tools/cli/__tests__/__mocks__/chalk.ts",
    "^ora$": "<rootDir>/tools/cli/__tests__/__mocks__/ora.ts",
    "^(\\.\\.?/.*)\\.js$": "$1",
  },
};