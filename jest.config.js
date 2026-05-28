const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  projects: [
    // ------------------------------------------------------------------
    // Default project — unit tests across all packages except integration
    // ------------------------------------------------------------------
    {
      displayName: "unit",
      testEnvironment: "node",
      setupFiles: ["<rootDir>/packages/frontend/src/tests/jest.setup.ts"],
      testPathIgnorePatterns: [
        "/node_modules/",
        "\\.e2e\\.test\\.[jt]sx?$",
        "MockLedgerTransport\\.ts$",
        // Jest matches **/__tests__/**/*.ts — exclude helpers and mocks
        "[/\\\\]__tests__[/\\\\]__mocks__[/\\\\]",
        "[/\\\\]__tests__[/\\\\]setup\\.ts$",
        "[/\\\\]packages[/\\\\]frontend[/\\\\]src[/\\\\]__tests__[/\\\\]mock-webauthn\\.ts$",
        // Keep integration tests out of the default run
        "[/\\\\]packages[/\\\\]integration-tests[/\\\\]",
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
        'node_modules/(?!(@stellar|@galaxy-kj)/)',
      ],
      moduleNameMapper: {
        "^@galaxy/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
        "^@galaxy-kj/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
        "^@galaxy-kj/core-wallet$": "<rootDir>/packages/core/wallet/src/index.ts",
        "^@galaxy-kj/core-stellar-sdk$": "<rootDir>/packages/core/stellar-sdk/src/browser.ts",
        "^chalk$": "<rootDir>/tools/cli/__tests__/__mocks__/chalk.ts",
        "^ora$": "<rootDir>/tools/cli/__tests__/__mocks__/ora.ts",
        // Resolve relative .js imports to .ts (ESM-style imports in tools/cli)
        "^(\\.\\.?/.*)\\.js$": "$1",
      },
    },

    // ------------------------------------------------------------------
    // Integration-tests project — Stellar Testnet end-to-end flows
    // Run with: npm run test:integration
    // ------------------------------------------------------------------
    {
      displayName: "integration",
      testEnvironment: "node",
      rootDir: "<rootDir>/packages/integration-tests",
      // <rootDir> now resolves to packages/integration-tests — do NOT repeat the prefix
      testMatch: ["<rootDir>/src/**/*.test.ts"],
      transform: {
        "^.+\\.tsx?$": [
          "ts-jest",
          {
            tsconfig: {
              module: "CommonJS",
              moduleResolution: "node",
              esModuleInterop: true,
              allowSyntheticDefaultImports: true,
              strict: true,
            },
          },
        ],
      },
      transformIgnorePatterns: [
        "node_modules/(?!(@stellar|@galaxy-kj)/)",
      ],
      moduleNameMapper: {
        // Step up two levels (integration-tests → packages → root) to reach sibling packages
        "^@galaxy-kj/core-oracles$": "<rootDir>/../../core/oracles/src/index.ts",
        "^@galaxy-kj/core-stellar-sdk$": "<rootDir>/../../core/stellar-sdk/src/browser.ts",
        "^@galaxy-kj/core-wallet$": "<rootDir>/../../core/wallet/src/index.ts",
        "^@galaxy-kj/core-defi-protocols$": "<rootDir>/../../core/defi-protocols/src/index.ts",
        "^(\\.{1,2}/.+)\\.js$": "$1",
      },
      testTimeout: 60000,
      maxWorkers: 1,
    },
  ],
};
