/** @type {import("jest").Config} */
module.exports = {
  displayName: "integration-tests",
  testEnvironment: "node",
  // Only pick up files inside src/ — the setup/ directory contains helpers,
  // not test suites.
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
  transformIgnorePatterns: ["node_modules/(?!(@stellar|@galaxy-kj)/)"],
  moduleNameMapper: {
    "^@galaxy-kj/core-oracles$":
      "<rootDir>/../../core/oracles/src/index.ts",
    "^@galaxy-kj/core-stellar-sdk$":
      "<rootDir>/../../core/stellar-sdk/src/browser.ts",
    "^@galaxy-kj/core-wallet$":
      "<rootDir>/../../core/wallet/src/index.ts",
    "^@galaxy-kj/core-defi-protocols$":
      "<rootDir>/../../core/defi-protocols/src/index.ts",
    // Resolve ESM-style relative .js imports to .ts
    "^(\\.{1,2}/.+)\\.js$": "$1",
  },
  // Integration tests hit live Testnet — give each suite 60 s by default.
  testTimeout: 60000,
  // Run suites serially to avoid Friendbot rate-limiting.
  maxWorkers: 1,
};
