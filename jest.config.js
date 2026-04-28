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
    'node_modules/(?!(@stellar|@galaxy-kj)/)',
  ],
  moduleNameMapper: {
    "^@galaxy/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
    "^@galaxy-kj/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
    "^@galaxy-kj/core-wallet$": "<rootDir>/packages/core/wallet/src/index.ts",
    "^@galaxy-kj/core-stellar-sdk$": "<rootDir>/packages/core/stellar-sdk/src/browser.ts",
    "^@galaxy-kj/core-test-utils$": "<rootDir>/packages/core/test-utils/src/index.ts",
    "^chalk$": "<rootDir>/tools/cli/__tests__/__mocks__/chalk.ts",
    "^ora$": "<rootDir>/tools/cli/__tests__/__mocks__/ora.ts",
    // Resolve relative .js imports to .ts (ESM-style imports in tools/cli)
    "^(\\.\\.?/.*)\\.js$": "$1",
  },

  // ── Coverage ─────────────────────────────────────────────────────────────
  collectCoverageFrom: [
    "packages/core/test-utils/src/**/*.ts",
    "!packages/core/test-utils/src/**/*.test.ts",
    "!packages/core/test-utils/src/setup/**",
  ],
  coverageThresholds: {
    "packages/core/test-utils/src/**/*.ts": {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },

  // ── Projects: unit (default) + integration (opt-in) ──────────────────────
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/packages/**/*.test.ts",
        "<rootDir>/tools/**/*.test.ts",
      ],
      testPathIgnorePatterns: [
        "/node_modules/",
        "\\.e2e\\.test\\.[jt]sx?$",
        "\\.integration\\.test\\.[jt]s$",
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
      transformIgnorePatterns: ['node_modules/(?!(@stellar|@galaxy-kj)/)'],
      moduleNameMapper: {
        "^@galaxy/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
        "^@galaxy-kj/core-oracles$": "<rootDir>/packages/core/oracles/src/index.ts",
        "^@galaxy-kj/core-wallet$": "<rootDir>/packages/core/wallet/src/index.ts",
        "^@galaxy-kj/core-stellar-sdk$": "<rootDir>/packages/core/stellar-sdk/src/browser.ts",
        "^@galaxy-kj/core-test-utils$": "<rootDir>/packages/core/test-utils/src/index.ts",
        "^chalk$": "<rootDir>/tools/cli/__tests__/__mocks__/chalk.ts",
        "^ora$": "<rootDir>/tools/cli/__tests__/__mocks__/ora.ts",
        "^(\\.\\.?/.*)\\.js$": "$1",
      },
      setupFiles: ["<rootDir>/packages/frontend/src/tests/jest.setup.ts"],
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      // Run integration tests sequentially to prevent SequenceNumber conflicts
      // (parallel workers each get their own Friendbot allocation via fundTestAccount)
      runner: "jest-runner",
      testMatch: ["<rootDir>/packages/**/*.integration.test.ts"],
      globalSetup: "<rootDir>/packages/core/test-utils/src/setup/global-setup.ts",
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            tsconfig: {
              module: 'CommonJS',
              moduleResolution: 'node',
              esModuleInterop: true,
              allowSyntheticDefaultImports: true,
              strict: true,
            },
          },
        ],
      },
      transformIgnorePatterns: ['node_modules/(?!(@stellar|@galaxy-kj)/)'],
      moduleNameMapper: {
        "^@galaxy-kj/core-test-utils$": "<rootDir>/packages/core/test-utils/src/index.ts",
        "^@galaxy-kj/core-stellar-sdk$": "<rootDir>/packages/core/stellar-sdk/src/browser.ts",
        "^(\\.\\.?/.*)\\.js$": "$1",
      },
    },
  ],
};
