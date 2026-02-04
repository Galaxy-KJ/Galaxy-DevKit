# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# 5.0.0 (2026-02-04)

### Bug Fixes

- add .js extensions to soroswap imports and resolve merge conflicts ([195b230](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/195b2300620fbe191f956eb8d0726f7b237c8a4e))
- added helpers and fixed typescript issues ([a8f3cb1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a8f3cb13513e8b525942d249a640b3379db42e37))
- address CodeRabbitAI review comments - include network in cache key, use toBeCloseTo for float tests, fix markdown formatting ([db39d5f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/db39d5f633a59db93c2d457a85f91f6622bf0aae))
- **blend:** remove console.log and add missing Blend SDK dependency ([58468c7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/58468c72add3ee7e2cda4101e0a3088d5afab6d5))
- CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
- **ci:** remove unsupported --max-warnings flag from lint command ([1888a12](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1888a127742f79c3e49b47e5741ad9434da592bc))
- cli build was failing ([4952232](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/495223286ffd59d3ea892801b31065f029153bc3))
- **cli:** address additional CodeRabbit review feedback ([56cd6ef](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/56cd6ef0e5d0a90feab812aea62eec9e1e469887))
- **cli:** address CodeRabbit review feedback ([c5c40f7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c5c40f70ab98a106c95be83772254369fc0ffc5b))
- **cli:** sync package-lock.json with merged package.json dependencies ([9f4b54e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9f4b54e25ef3dfbe2acfd7b84b92e4d7b704fc9d))
- **cli:** use local MockOracleSource to avoid core-oracles dist export gap ([5348534](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/534853458c75232352645cb55d9a300197eaa525))
- **cli:** use MedianStrategy fallback for mean aggregation ([b413b14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b413b1409b78beed22ca114e6feed51ab6912028))
- **core:** resolve type exports and harness issues for CI build ([1322cfc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1322cfc5936d31ba398965a63edc88d8a77604d1))
- **deps:** correct Blend SDK version to 3.2.2 ([6436d3c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6436d3ccbf29b27d982c0dca206db1fb26f76650))
- rename version script to bump to avoid lerna publish conflicts ([2ac0379](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2ac037981d70eed47ba35e27ee1bd6c3d4c40fcf))
- resolve build errors in stellar-sdk and CLI packages ([f99afe6](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f99afe65e24eab43921d92c64f18af51e3c740d8))
- update all packages to support ES modules with .js extensions ([54337dc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/54337dc56a1ba327226950edc2c4df16620ae789))
- update ROADMAP.md to mark issue as completed (or soon to be) ([351540d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/351540d875621e944744760a52973d38e2ba4b22))

### Features

- Add `@galaxy/core-defi-protocols` package for Stellar DeFi integrations and update root package overrides. ([5224965](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/52249651ff24d3467beb865de247faa636c772a1))
- add documentation for the changes provided ([759dc13](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/759dc134ec423fc9d3bd218d9a71532461fd9dc5))
- **api:** implement WebSocket API server with real-time event streaming ([7c5ead7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7c5ead7c3dc8ea229930143e2ade945ea6ff4a05))
- **api:** implement WebSocket API server with real-time event streaming ([e52b653](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e52b653edcc1d9dcd39984144082b8b9405e2e90)), closes [#9](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/9)
- **blend:** add parseHealthFactorData method for health factor parsing ([4d33e06](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4d33e06acc2d4db08d0f360c2d55f63eeb7d364f))
- claimable balance operatons and predicates support ([a2c0297](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a2c0297b12c56084207ab3fa019911d4a3ccd3a4))
- **cli:** add Blend Protocol CLI commands ([aa82514](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/aa8251478dac62b75c753a476bc35ae5494855a2))
- **cli:** add oracle data query commands [[#102](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/102)] ([f7e1783](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f7e17835c5abaa4f8865c2669ee8d24a281de7f6))
- **cli:** add protocol interaction commands ([6b36f35](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6b36f35152dadd3771427e1c561a69d4f11185ba))
- **cli:** add protocol interaction commands ([d863c62](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d863c625d69b55b060ebe754ba1f98a496cbed39))
- **cli:** add protocol interaction commands ([b94fb0b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b94fb0b1408ee77b25210705e03a4825b10cd92d))
- **cli:** add real-time data to dashboard ([c9484e1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c9484e16af5a9e47a808145bb30ce3b62201c315))
- **cli:** add REPL loop, workflows, and interactive entry point ([4b3ea7c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4b3ea7cdda64ac4ae499a2f18b4b0203ab4674dd))
- **cli:** add timeout and JSON output to transaction watch ([2505d83](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2505d8309c8252ebbb448452b5cc6b28f757e915))
- **cli:** add types and dependencies for interactive mode ([d92fe16](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d92fe16c0b80e407e916b90cdcfcbf1815ad03d7))
- **cli:** enhance stream-manager with auto-reconnection and timeout ([2fb8607](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2fb86070288146577b0b4e2b46a81ef3f7be016c))
- **cli:** implement core interactive mode modules ([5a5364e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5a5364ed18faa1e03830c6ed115df1ab52b0ee97))
- **cli:** implement fully working create command with advanced scaffolding ([b481e18](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b481e18d9ff31e5071844cfc36b6d811325f2276))
- **cli:** implement Soroban contract event streaming ([78eecb9](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/78eecb9572dfcb820cc0eb1d6c6b68efc3892298))
- **cli:** implement watch mode commands (dashboard, network, oracle) ([67595b8](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/67595b829a1e53e5671c8e4d7ec4dfa002817e84))
- **cli:** integrate interactive mode and add tests/docs ([3f55bc7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3f55bc71f69f24bb390ec5bd0bfb06d50f97f48b))
- **cli:** integrate oracle aggregator in watch command ([437b825](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/437b825c6ad7219986eeeecc9ab36bbab9449cf9))
- **core:** add defi protocols module ([2165d84](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2165d84adec6bbd5fd698ae30980a607660485a2))
- **defi-protocols:** add custom error classes ([5ff9556](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5ff95566b748f0714a8caa5b0f30ddddbdb9201f))
- **defi-protocols:** add discriminated operation types ([e91d615](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e91d61584e8a2cd205a615f80a331d92621cc19d))
- **defi-protocols:** add type guards for operations ([2faeda2](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2faeda25eaf9ff42a9c84b8953ac1fefa16f1688))
- **defi-protocols:** export new modules ([95f4980](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/95f49809d9a07aedc41783842845ee5413b54283))
- **defi:** implement core Soroswap DEX protocol service ([4390c15](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4390c15026d0f570571f6eff2f1a4878335bb153)), closes [#27](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/27) [-#30](https://github.com/-/issues/30)
- enhance Oracle System documentation and roadmap ([7b49413](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b49413552907e6e4a7bdb4f80085e4201068774))
- functions now on use-stellar.ts ([5d04d45](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5d04d45b4b2713ef87e1017fd5df0b7a623649f0))
- implement jest tests, add cli command anda final fixes ([9ee2439](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9ee2439e59f7bbb68c1b1e103c0d52c5572648ed))
- implement jest tests, add cli command anda final fixes ([cb308eb](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/cb308ebb8067e4b284cf65ea553fa886cd8244d1))
- implement oracle formatter, command group, and subcommands ([6eac895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6eac895885e346135e23bead4b9b0585b28c9a01))
- Implement Social Recovery System ([3ea2cd5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3ea2cd55a6b95f6b89e9cf4ba120c249fbba214a))
- implement unit tests for claimable balance manager and stellar services ([ed3d839](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ed3d839981261834471f3cb995248dc2393fd62f))
- Implement wallet management CLI commands ([#101](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/101)) ([6ea42d9](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6ea42d9374352f7ea3b88f613eb8b9c11d1d4e8d))
- implement wallet management commands in CLI [#95](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/95) ([4c1883e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4c1883ef2c2892f69eb44354277719f4ca8851b1))
- implement watch command for real-time monitoring and fix CI infrastructure ([8bcca2d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/8bcca2dd8389a24d73bf77647df2c779b20fe260))
- implement watch mode and upgrade linter to ESLint v9 (minimal changes) ([fec9e9d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fec9e9d1c01be05258b6d589e817a8b26ba1df45))
- Implementation Path Payment (Swap) Improvements ([0c55948](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/0c55948170dda5943216765ab2da91a9b6c0e4b9))
- initial ClaimableBalanceManager class and types ([d536c6f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d536c6f724603e52cd24a5053c18fe3698f85b23))
- initial implementation for using oracle and parsing duration (+ deps) ([7b56c5b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b56c5baa64e7636a1f0eba34bb8c23970429ebe))
- initial project structure with all packages and tools ([46e16d5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/46e16d5fc664759b4e26ba206d0c88c868e16111))
- **interactive:** add blend and watch to COMMAND_REGISTRY for tab completion ([06c056f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/06c056f0ad3fb4587a34f945d35541783af371fc))
- **interactive:** arrow-key history and Ctrl+R reverse-i-search ([c767c7b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c767c7bea648bf0a01afa331874d71d30c464cc8))
- **invisible-wallet:** add comprehensive backup system ([b9f8bda](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b9f8bda5d6cd84f05480ba8f9f9c2774d5b95478))
- **sdk:** implement Blend Protocol lending/borrowing integration ([a83b171](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a83b171d57eb0dfe4e3aa3864ee567452dc1f9ce)), closes [#21](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/21) [-#25](https://github.com/-/issues/25)
- **soroban:** Add comprehensive examples for Soroban contract operations ([2f1843c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2f1843c249b8e4e866111f38c1ec81c8edad6778))
- **soroban:** Add comprehensive test suite for Soroban utilities ([139f641](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/139f64152e22d6aafa079ec146b4b5ea68c709d1))
- **soroban:** Add core contract management and event monitoring ([fe2757b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fe2757b1eabc76c7f045945ebdf15d33ebbdd365))
- **soroban:** Add core Soroban types and module structure ([f196e14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f196e1411b2f4e68658ff43e8ddb5388a15a4bb6))
- **soroban:** Add Soroban utilities package configuration and documentation ([9283d2c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9283d2c300ebcc6950f930f32beba277a338260e))
- **soroban:** Add specialized helper classes for common patterns ([a642119](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a642119060f7a8db9bd11de5d4e4d83e063e9d15))
- **soroban:** Add specialized utility classes for error handling and events ([7566729](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7566729efc7f6a5ce3ba5ab5174179c2ff65e25e))
- **soroban:** Add utility classes for type conversion and ABI parsing ([da5511a](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/da5511a53cbc1fd0b76f1aa38fe3f3a327cf049d))
- **soroban:** Update main SDK exports to include Soroban functionality ([254dd68](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/254dd68f85ae8a88fbee034c2067387d547a45c8))
- **stellar-sdk:** add sponsored reserves builders ([c225895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c2258953d8adf575a4ca6b78d27f3f8b2d5e4a5c))
- **stellar-sdk:** add sponsored reserves manager service ([3c4183f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3c4183fc87b8ee43a065f5c566157d21ce50486f))
- **stellar-sdk:** add sponsored reserves module index ([1d1f7e4](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1d1f7e42fe4d7e65ff8f094ad91f0de8697ec662))
- **stellar-sdk:** add sponsored reserves templates ([66ab79d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/66ab79d6bbf7c9ed09be22b03f3037c12c1873ff))
- **stellar-sdk:** add sponsored reserves types ([5afc26c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5afc26cffdbe78f2f1e6a1be7d4fdc5253489559))
- **stellar-sdk:** add sponsorship validation and cost calculator utils ([c4d679e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c4d679e822c2bb49c58753e45315def850168dac))
- **stellar-sdk:** enhance claimable balances predicate builder ([1a65b55](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1a65b55b6d3eabcd430f34ee526aa63d9e80c1c9))
- **stellar-sdk:** export sponsored reserves module ([ccba36d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ccba36d7508832c3b36f9ec76c476a8de4ebe38d))

### BREAKING CHANGES

- All packages now use native ES modules.
  Consumers must ensure their environment supports ES modules.

Affected packages:

- @galaxy-kj/core-automation
- @galaxy-kj/core-defi-protocols
- @galaxy-kj/core-invisible-wallet
- @galaxy-kj/core-oracles
- @galaxy-kj/core-stellar-sdk

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>

- **soroban:** None
  FEATURE: Soroban examples and documentation
- **soroban:** None
  FEATURE: Soroban integration with main SDK exports
- **soroban:** None
  FEATURE: Complete Soroban test coverage
- **soroban:** None
  FEATURE: Soroban contract helpers and wrappers
- **soroban:** None
  FEATURE: Core Soroban contract management
- **soroban:** None
  FEATURE: Advanced Soroban utilities
- **soroban:** None
  FEATURE: Core Soroban utilities
- **soroban:** None
  FEATURE: Core Soroban type system
- **soroban:** None
  FEATURE: Add Soroban smart contract support to Galaxy SDK

# 4.0.0 (2026-02-04)

### Bug Fixes

- add .js extensions to soroswap imports and resolve merge conflicts ([195b230](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/195b2300620fbe191f956eb8d0726f7b237c8a4e))
- added helpers and fixed typescript issues ([a8f3cb1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a8f3cb13513e8b525942d249a640b3379db42e37))
- address CodeRabbitAI review comments - include network in cache key, use toBeCloseTo for float tests, fix markdown formatting ([db39d5f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/db39d5f633a59db93c2d457a85f91f6622bf0aae))
- **blend:** remove console.log and add missing Blend SDK dependency ([58468c7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/58468c72add3ee7e2cda4101e0a3088d5afab6d5))
- CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
- **ci:** remove unsupported --max-warnings flag from lint command ([1888a12](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1888a127742f79c3e49b47e5741ad9434da592bc))
- cli build was failing ([4952232](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/495223286ffd59d3ea892801b31065f029153bc3))
- **cli:** address additional CodeRabbit review feedback ([56cd6ef](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/56cd6ef0e5d0a90feab812aea62eec9e1e469887))
- **cli:** address CodeRabbit review feedback ([c5c40f7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c5c40f70ab98a106c95be83772254369fc0ffc5b))
- **cli:** sync package-lock.json with merged package.json dependencies ([9f4b54e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9f4b54e25ef3dfbe2acfd7b84b92e4d7b704fc9d))
- **cli:** use local MockOracleSource to avoid core-oracles dist export gap ([5348534](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/534853458c75232352645cb55d9a300197eaa525))
- **cli:** use MedianStrategy fallback for mean aggregation ([b413b14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b413b1409b78beed22ca114e6feed51ab6912028))
- **core:** resolve type exports and harness issues for CI build ([1322cfc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1322cfc5936d31ba398965a63edc88d8a77604d1))
- **deps:** correct Blend SDK version to 3.2.2 ([6436d3c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6436d3ccbf29b27d982c0dca206db1fb26f76650))
- update all packages to support ES modules with .js extensions ([54337dc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/54337dc56a1ba327226950edc2c4df16620ae789))
- update ROADMAP.md to mark issue as completed (or soon to be) ([351540d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/351540d875621e944744760a52973d38e2ba4b22))

### Features

- Add `@galaxy/core-defi-protocols` package for Stellar DeFi integrations and update root package overrides. ([5224965](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/52249651ff24d3467beb865de247faa636c772a1))
- add documentation for the changes provided ([759dc13](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/759dc134ec423fc9d3bd218d9a71532461fd9dc5))
- **api:** implement WebSocket API server with real-time event streaming ([7c5ead7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7c5ead7c3dc8ea229930143e2ade945ea6ff4a05))
- **api:** implement WebSocket API server with real-time event streaming ([e52b653](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e52b653edcc1d9dcd39984144082b8b9405e2e90)), closes [#9](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/9)
- **blend:** add parseHealthFactorData method for health factor parsing ([4d33e06](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4d33e06acc2d4db08d0f360c2d55f63eeb7d364f))
- claimable balance operatons and predicates support ([a2c0297](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a2c0297b12c56084207ab3fa019911d4a3ccd3a4))
- **cli:** add Blend Protocol CLI commands ([aa82514](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/aa8251478dac62b75c753a476bc35ae5494855a2))
- **cli:** add oracle data query commands [[#102](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/102)] ([f7e1783](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f7e17835c5abaa4f8865c2669ee8d24a281de7f6))
- **cli:** add protocol interaction commands ([6b36f35](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6b36f35152dadd3771427e1c561a69d4f11185ba))
- **cli:** add protocol interaction commands ([d863c62](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d863c625d69b55b060ebe754ba1f98a496cbed39))
- **cli:** add protocol interaction commands ([b94fb0b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b94fb0b1408ee77b25210705e03a4825b10cd92d))
- **cli:** add real-time data to dashboard ([c9484e1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c9484e16af5a9e47a808145bb30ce3b62201c315))
- **cli:** add REPL loop, workflows, and interactive entry point ([4b3ea7c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4b3ea7cdda64ac4ae499a2f18b4b0203ab4674dd))
- **cli:** add timeout and JSON output to transaction watch ([2505d83](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2505d8309c8252ebbb448452b5cc6b28f757e915))
- **cli:** add types and dependencies for interactive mode ([d92fe16](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d92fe16c0b80e407e916b90cdcfcbf1815ad03d7))
- **cli:** enhance stream-manager with auto-reconnection and timeout ([2fb8607](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2fb86070288146577b0b4e2b46a81ef3f7be016c))
- **cli:** implement core interactive mode modules ([5a5364e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5a5364ed18faa1e03830c6ed115df1ab52b0ee97))
- **cli:** implement fully working create command with advanced scaffolding ([b481e18](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b481e18d9ff31e5071844cfc36b6d811325f2276))
- **cli:** implement Soroban contract event streaming ([78eecb9](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/78eecb9572dfcb820cc0eb1d6c6b68efc3892298))
- **cli:** implement watch mode commands (dashboard, network, oracle) ([67595b8](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/67595b829a1e53e5671c8e4d7ec4dfa002817e84))
- **cli:** integrate interactive mode and add tests/docs ([3f55bc7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3f55bc71f69f24bb390ec5bd0bfb06d50f97f48b))
- **cli:** integrate oracle aggregator in watch command ([437b825](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/437b825c6ad7219986eeeecc9ab36bbab9449cf9))
- **core:** add defi protocols module ([2165d84](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2165d84adec6bbd5fd698ae30980a607660485a2))
- **defi-protocols:** add custom error classes ([5ff9556](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5ff95566b748f0714a8caa5b0f30ddddbdb9201f))
- **defi-protocols:** add discriminated operation types ([e91d615](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e91d61584e8a2cd205a615f80a331d92621cc19d))
- **defi-protocols:** add type guards for operations ([2faeda2](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2faeda25eaf9ff42a9c84b8953ac1fefa16f1688))
- **defi-protocols:** export new modules ([95f4980](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/95f49809d9a07aedc41783842845ee5413b54283))
- **defi:** implement core Soroswap DEX protocol service ([4390c15](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4390c15026d0f570571f6eff2f1a4878335bb153)), closes [#27](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/27) [-#30](https://github.com/-/issues/30)
- enhance Oracle System documentation and roadmap ([7b49413](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b49413552907e6e4a7bdb4f80085e4201068774))
- functions now on use-stellar.ts ([5d04d45](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5d04d45b4b2713ef87e1017fd5df0b7a623649f0))
- implement jest tests, add cli command anda final fixes ([9ee2439](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9ee2439e59f7bbb68c1b1e103c0d52c5572648ed))
- implement jest tests, add cli command anda final fixes ([cb308eb](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/cb308ebb8067e4b284cf65ea553fa886cd8244d1))
- implement oracle formatter, command group, and subcommands ([6eac895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6eac895885e346135e23bead4b9b0585b28c9a01))
- Implement Social Recovery System ([3ea2cd5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3ea2cd55a6b95f6b89e9cf4ba120c249fbba214a))
- implement unit tests for claimable balance manager and stellar services ([ed3d839](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ed3d839981261834471f3cb995248dc2393fd62f))
- Implement wallet management CLI commands ([#101](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/101)) ([6ea42d9](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6ea42d9374352f7ea3b88f613eb8b9c11d1d4e8d))
- implement wallet management commands in CLI [#95](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/95) ([4c1883e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4c1883ef2c2892f69eb44354277719f4ca8851b1))
- implement watch command for real-time monitoring and fix CI infrastructure ([8bcca2d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/8bcca2dd8389a24d73bf77647df2c779b20fe260))
- implement watch mode and upgrade linter to ESLint v9 (minimal changes) ([fec9e9d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fec9e9d1c01be05258b6d589e817a8b26ba1df45))
- Implementation Path Payment (Swap) Improvements ([0c55948](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/0c55948170dda5943216765ab2da91a9b6c0e4b9))
- initial ClaimableBalanceManager class and types ([d536c6f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d536c6f724603e52cd24a5053c18fe3698f85b23))
- initial implementation for using oracle and parsing duration (+ deps) ([7b56c5b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b56c5baa64e7636a1f0eba34bb8c23970429ebe))
- initial project structure with all packages and tools ([46e16d5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/46e16d5fc664759b4e26ba206d0c88c868e16111))
- **interactive:** add blend and watch to COMMAND_REGISTRY for tab completion ([06c056f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/06c056f0ad3fb4587a34f945d35541783af371fc))
- **interactive:** arrow-key history and Ctrl+R reverse-i-search ([c767c7b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c767c7bea648bf0a01afa331874d71d30c464cc8))
- **invisible-wallet:** add comprehensive backup system ([b9f8bda](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b9f8bda5d6cd84f05480ba8f9f9c2774d5b95478))
- **sdk:** implement Blend Protocol lending/borrowing integration ([a83b171](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a83b171d57eb0dfe4e3aa3864ee567452dc1f9ce)), closes [#21](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/21) [-#25](https://github.com/-/issues/25)
- **soroban:** Add comprehensive examples for Soroban contract operations ([2f1843c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2f1843c249b8e4e866111f38c1ec81c8edad6778))
- **soroban:** Add comprehensive test suite for Soroban utilities ([139f641](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/139f64152e22d6aafa079ec146b4b5ea68c709d1))
- **soroban:** Add core contract management and event monitoring ([fe2757b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fe2757b1eabc76c7f045945ebdf15d33ebbdd365))
- **soroban:** Add core Soroban types and module structure ([f196e14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f196e1411b2f4e68658ff43e8ddb5388a15a4bb6))
- **soroban:** Add Soroban utilities package configuration and documentation ([9283d2c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9283d2c300ebcc6950f930f32beba277a338260e))
- **soroban:** Add specialized helper classes for common patterns ([a642119](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a642119060f7a8db9bd11de5d4e4d83e063e9d15))
- **soroban:** Add specialized utility classes for error handling and events ([7566729](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7566729efc7f6a5ce3ba5ab5174179c2ff65e25e))
- **soroban:** Add utility classes for type conversion and ABI parsing ([da5511a](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/da5511a53cbc1fd0b76f1aa38fe3f3a327cf049d))
- **soroban:** Update main SDK exports to include Soroban functionality ([254dd68](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/254dd68f85ae8a88fbee034c2067387d547a45c8))
- **stellar-sdk:** add sponsored reserves builders ([c225895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c2258953d8adf575a4ca6b78d27f3f8b2d5e4a5c))
- **stellar-sdk:** add sponsored reserves manager service ([3c4183f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3c4183fc87b8ee43a065f5c566157d21ce50486f))
- **stellar-sdk:** add sponsored reserves module index ([1d1f7e4](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1d1f7e42fe4d7e65ff8f094ad91f0de8697ec662))
- **stellar-sdk:** add sponsored reserves templates ([66ab79d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/66ab79d6bbf7c9ed09be22b03f3037c12c1873ff))
- **stellar-sdk:** add sponsored reserves types ([5afc26c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5afc26cffdbe78f2f1e6a1be7d4fdc5253489559))
- **stellar-sdk:** add sponsorship validation and cost calculator utils ([c4d679e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c4d679e822c2bb49c58753e45315def850168dac))
- **stellar-sdk:** enhance claimable balances predicate builder ([1a65b55](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1a65b55b6d3eabcd430f34ee526aa63d9e80c1c9))
- **stellar-sdk:** export sponsored reserves module ([ccba36d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ccba36d7508832c3b36f9ec76c476a8de4ebe38d))

### BREAKING CHANGES

- All packages now use native ES modules.
  Consumers must ensure their environment supports ES modules.

Affected packages:

- @galaxy-kj/core-automation
- @galaxy-kj/core-defi-protocols
- @galaxy-kj/core-invisible-wallet
- @galaxy-kj/core-oracles
- @galaxy-kj/core-stellar-sdk

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>

- **soroban:** None
  FEATURE: Soroban examples and documentation
- **soroban:** None
  FEATURE: Soroban integration with main SDK exports
- **soroban:** None
  FEATURE: Complete Soroban test coverage
- **soroban:** None
  FEATURE: Soroban contract helpers and wrappers
- **soroban:** None
  FEATURE: Core Soroban contract management
- **soroban:** None
  FEATURE: Advanced Soroban utilities
- **soroban:** None
  FEATURE: Core Soroban utilities
- **soroban:** None
  FEATURE: Core Soroban type system
- **soroban:** None
  FEATURE: Add Soroban smart contract support to Galaxy SDK

# 3.0.0 (2026-02-04)

### Bug Fixes

- add .js extensions to soroswap imports and resolve merge conflicts ([195b230](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/195b2300620fbe191f956eb8d0726f7b237c8a4e))
- added helpers and fixed typescript issues ([a8f3cb1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a8f3cb13513e8b525942d249a640b3379db42e37))
- address CodeRabbitAI review comments - include network in cache key, use toBeCloseTo for float tests, fix markdown formatting ([db39d5f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/db39d5f633a59db93c2d457a85f91f6622bf0aae))
- **blend:** remove console.log and add missing Blend SDK dependency ([58468c7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/58468c72add3ee7e2cda4101e0a3088d5afab6d5))
- CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
- **ci:** remove unsupported --max-warnings flag from lint command ([1888a12](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1888a127742f79c3e49b47e5741ad9434da592bc))
- cli build was failing ([4952232](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/495223286ffd59d3ea892801b31065f029153bc3))
- **cli:** address additional CodeRabbit review feedback ([56cd6ef](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/56cd6ef0e5d0a90feab812aea62eec9e1e469887))
- **cli:** address CodeRabbit review feedback ([c5c40f7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c5c40f70ab98a106c95be83772254369fc0ffc5b))
- **cli:** sync package-lock.json with merged package.json dependencies ([9f4b54e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9f4b54e25ef3dfbe2acfd7b84b92e4d7b704fc9d))
- **cli:** use local MockOracleSource to avoid core-oracles dist export gap ([5348534](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/534853458c75232352645cb55d9a300197eaa525))
- **cli:** use MedianStrategy fallback for mean aggregation ([b413b14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b413b1409b78beed22ca114e6feed51ab6912028))
- **core:** resolve type exports and harness issues for CI build ([1322cfc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1322cfc5936d31ba398965a63edc88d8a77604d1))
- **deps:** correct Blend SDK version to 3.2.2 ([6436d3c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6436d3ccbf29b27d982c0dca206db1fb26f76650))
- update all packages to support ES modules with .js extensions ([54337dc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/54337dc56a1ba327226950edc2c4df16620ae789))
- update ROADMAP.md to mark issue as completed (or soon to be) ([351540d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/351540d875621e944744760a52973d38e2ba4b22))

### Features

- Add `@galaxy/core-defi-protocols` package for Stellar DeFi integrations and update root package overrides. ([5224965](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/52249651ff24d3467beb865de247faa636c772a1))
- add documentation for the changes provided ([759dc13](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/759dc134ec423fc9d3bd218d9a71532461fd9dc5))
- **api:** implement WebSocket API server with real-time event streaming ([7c5ead7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7c5ead7c3dc8ea229930143e2ade945ea6ff4a05))
- **api:** implement WebSocket API server with real-time event streaming ([e52b653](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e52b653edcc1d9dcd39984144082b8b9405e2e90)), closes [#9](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/9)
- **blend:** add parseHealthFactorData method for health factor parsing ([4d33e06](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4d33e06acc2d4db08d0f360c2d55f63eeb7d364f))
- claimable balance operatons and predicates support ([a2c0297](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a2c0297b12c56084207ab3fa019911d4a3ccd3a4))
- **cli:** add Blend Protocol CLI commands ([aa82514](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/aa8251478dac62b75c753a476bc35ae5494855a2))
- **cli:** add oracle data query commands [[#102](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/102)] ([f7e1783](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f7e17835c5abaa4f8865c2669ee8d24a281de7f6))
- **cli:** add protocol interaction commands ([6b36f35](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6b36f35152dadd3771427e1c561a69d4f11185ba))
- **cli:** add protocol interaction commands ([d863c62](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d863c625d69b55b060ebe754ba1f98a496cbed39))
- **cli:** add protocol interaction commands ([b94fb0b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b94fb0b1408ee77b25210705e03a4825b10cd92d))
- **cli:** add real-time data to dashboard ([c9484e1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c9484e16af5a9e47a808145bb30ce3b62201c315))
- **cli:** add REPL loop, workflows, and interactive entry point ([4b3ea7c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4b3ea7cdda64ac4ae499a2f18b4b0203ab4674dd))
- **cli:** add timeout and JSON output to transaction watch ([2505d83](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2505d8309c8252ebbb448452b5cc6b28f757e915))
- **cli:** add types and dependencies for interactive mode ([d92fe16](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d92fe16c0b80e407e916b90cdcfcbf1815ad03d7))
- **cli:** enhance stream-manager with auto-reconnection and timeout ([2fb8607](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2fb86070288146577b0b4e2b46a81ef3f7be016c))
- **cli:** implement core interactive mode modules ([5a5364e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5a5364ed18faa1e03830c6ed115df1ab52b0ee97))
- **cli:** implement fully working create command with advanced scaffolding ([b481e18](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b481e18d9ff31e5071844cfc36b6d811325f2276))
- **cli:** implement Soroban contract event streaming ([78eecb9](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/78eecb9572dfcb820cc0eb1d6c6b68efc3892298))
- **cli:** implement watch mode commands (dashboard, network, oracle) ([67595b8](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/67595b829a1e53e5671c8e4d7ec4dfa002817e84))
- **cli:** integrate interactive mode and add tests/docs ([3f55bc7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3f55bc71f69f24bb390ec5bd0bfb06d50f97f48b))
- **cli:** integrate oracle aggregator in watch command ([437b825](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/437b825c6ad7219986eeeecc9ab36bbab9449cf9))
- **core:** add defi protocols module ([2165d84](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2165d84adec6bbd5fd698ae30980a607660485a2))
- **defi-protocols:** add custom error classes ([5ff9556](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5ff95566b748f0714a8caa5b0f30ddddbdb9201f))
- **defi-protocols:** add discriminated operation types ([e91d615](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e91d61584e8a2cd205a615f80a331d92621cc19d))
- **defi-protocols:** add type guards for operations ([2faeda2](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2faeda25eaf9ff42a9c84b8953ac1fefa16f1688))
- **defi-protocols:** export new modules ([95f4980](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/95f49809d9a07aedc41783842845ee5413b54283))
- **defi:** implement core Soroswap DEX protocol service ([4390c15](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4390c15026d0f570571f6eff2f1a4878335bb153)), closes [#27](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/27) [-#30](https://github.com/-/issues/30)
- enhance Oracle System documentation and roadmap ([7b49413](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b49413552907e6e4a7bdb4f80085e4201068774))
- functions now on use-stellar.ts ([5d04d45](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5d04d45b4b2713ef87e1017fd5df0b7a623649f0))
- implement jest tests, add cli command anda final fixes ([9ee2439](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9ee2439e59f7bbb68c1b1e103c0d52c5572648ed))
- implement jest tests, add cli command anda final fixes ([cb308eb](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/cb308ebb8067e4b284cf65ea553fa886cd8244d1))
- implement oracle formatter, command group, and subcommands ([6eac895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6eac895885e346135e23bead4b9b0585b28c9a01))
- Implement Social Recovery System ([3ea2cd5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3ea2cd55a6b95f6b89e9cf4ba120c249fbba214a))
- implement unit tests for claimable balance manager and stellar services ([ed3d839](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ed3d839981261834471f3cb995248dc2393fd62f))
- Implement wallet management CLI commands ([#101](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/101)) ([6ea42d9](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6ea42d9374352f7ea3b88f613eb8b9c11d1d4e8d))
- implement wallet management commands in CLI [#95](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/95) ([4c1883e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4c1883ef2c2892f69eb44354277719f4ca8851b1))
- implement watch command for real-time monitoring and fix CI infrastructure ([8bcca2d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/8bcca2dd8389a24d73bf77647df2c779b20fe260))
- implement watch mode and upgrade linter to ESLint v9 (minimal changes) ([fec9e9d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fec9e9d1c01be05258b6d589e817a8b26ba1df45))
- Implementation Path Payment (Swap) Improvements ([0c55948](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/0c55948170dda5943216765ab2da91a9b6c0e4b9))
- initial ClaimableBalanceManager class and types ([d536c6f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d536c6f724603e52cd24a5053c18fe3698f85b23))
- initial implementation for using oracle and parsing duration (+ deps) ([7b56c5b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b56c5baa64e7636a1f0eba34bb8c23970429ebe))
- initial project structure with all packages and tools ([46e16d5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/46e16d5fc664759b4e26ba206d0c88c868e16111))
- **interactive:** add blend and watch to COMMAND_REGISTRY for tab completion ([06c056f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/06c056f0ad3fb4587a34f945d35541783af371fc))
- **interactive:** arrow-key history and Ctrl+R reverse-i-search ([c767c7b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c767c7bea648bf0a01afa331874d71d30c464cc8))
- **invisible-wallet:** add comprehensive backup system ([b9f8bda](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b9f8bda5d6cd84f05480ba8f9f9c2774d5b95478))
- **sdk:** implement Blend Protocol lending/borrowing integration ([a83b171](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a83b171d57eb0dfe4e3aa3864ee567452dc1f9ce)), closes [#21](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/21) [-#25](https://github.com/-/issues/25)
- **soroban:** Add comprehensive examples for Soroban contract operations ([2f1843c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2f1843c249b8e4e866111f38c1ec81c8edad6778))
- **soroban:** Add comprehensive test suite for Soroban utilities ([139f641](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/139f64152e22d6aafa079ec146b4b5ea68c709d1))
- **soroban:** Add core contract management and event monitoring ([fe2757b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fe2757b1eabc76c7f045945ebdf15d33ebbdd365))
- **soroban:** Add core Soroban types and module structure ([f196e14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f196e1411b2f4e68658ff43e8ddb5388a15a4bb6))
- **soroban:** Add Soroban utilities package configuration and documentation ([9283d2c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9283d2c300ebcc6950f930f32beba277a338260e))
- **soroban:** Add specialized helper classes for common patterns ([a642119](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a642119060f7a8db9bd11de5d4e4d83e063e9d15))
- **soroban:** Add specialized utility classes for error handling and events ([7566729](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7566729efc7f6a5ce3ba5ab5174179c2ff65e25e))
- **soroban:** Add utility classes for type conversion and ABI parsing ([da5511a](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/da5511a53cbc1fd0b76f1aa38fe3f3a327cf049d))
- **soroban:** Update main SDK exports to include Soroban functionality ([254dd68](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/254dd68f85ae8a88fbee034c2067387d547a45c8))
- **stellar-sdk:** add sponsored reserves builders ([c225895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c2258953d8adf575a4ca6b78d27f3f8b2d5e4a5c))
- **stellar-sdk:** add sponsored reserves manager service ([3c4183f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3c4183fc87b8ee43a065f5c566157d21ce50486f))
- **stellar-sdk:** add sponsored reserves module index ([1d1f7e4](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1d1f7e42fe4d7e65ff8f094ad91f0de8697ec662))
- **stellar-sdk:** add sponsored reserves templates ([66ab79d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/66ab79d6bbf7c9ed09be22b03f3037c12c1873ff))
- **stellar-sdk:** add sponsored reserves types ([5afc26c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5afc26cffdbe78f2f1e6a1be7d4fdc5253489559))
- **stellar-sdk:** add sponsorship validation and cost calculator utils ([c4d679e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c4d679e822c2bb49c58753e45315def850168dac))
- **stellar-sdk:** enhance claimable balances predicate builder ([1a65b55](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1a65b55b6d3eabcd430f34ee526aa63d9e80c1c9))
- **stellar-sdk:** export sponsored reserves module ([ccba36d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ccba36d7508832c3b36f9ec76c476a8de4ebe38d))

### BREAKING CHANGES

- All packages now use native ES modules.
  Consumers must ensure their environment supports ES modules.

Affected packages:

- @galaxy-kj/core-automation
- @galaxy-kj/core-defi-protocols
- @galaxy-kj/core-invisible-wallet
- @galaxy-kj/core-oracles
- @galaxy-kj/core-stellar-sdk

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>

- **soroban:** None
  FEATURE: Soroban examples and documentation
- **soroban:** None
  FEATURE: Soroban integration with main SDK exports
- **soroban:** None
  FEATURE: Complete Soroban test coverage
- **soroban:** None
  FEATURE: Soroban contract helpers and wrappers
- **soroban:** None
  FEATURE: Core Soroban contract management
- **soroban:** None
  FEATURE: Advanced Soroban utilities
- **soroban:** None
  FEATURE: Core Soroban utilities
- **soroban:** None
  FEATURE: Core Soroban type system
- **soroban:** None
  FEATURE: Add Soroban smart contract support to Galaxy SDK

# 2.1.0 (2026-02-04)

### Bug Fixes

- added helpers and fixed typescript issues ([a8f3cb1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a8f3cb13513e8b525942d249a640b3379db42e37))
- address CodeRabbitAI review comments - include network in cache key, use toBeCloseTo for float tests, fix markdown formatting ([db39d5f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/db39d5f633a59db93c2d457a85f91f6622bf0aae))
- **blend:** remove console.log and add missing Blend SDK dependency ([58468c7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/58468c72add3ee7e2cda4101e0a3088d5afab6d5))
- CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
- **ci:** remove unsupported --max-warnings flag from lint command ([1888a12](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1888a127742f79c3e49b47e5741ad9434da592bc))
- cli build was failing ([4952232](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/495223286ffd59d3ea892801b31065f029153bc3))
- **cli:** address additional CodeRabbit review feedback ([56cd6ef](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/56cd6ef0e5d0a90feab812aea62eec9e1e469887))
- **cli:** address CodeRabbit review feedback ([c5c40f7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c5c40f70ab98a106c95be83772254369fc0ffc5b))
- **cli:** sync package-lock.json with merged package.json dependencies ([9f4b54e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9f4b54e25ef3dfbe2acfd7b84b92e4d7b704fc9d))
- **cli:** use local MockOracleSource to avoid core-oracles dist export gap ([5348534](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/534853458c75232352645cb55d9a300197eaa525))
- **cli:** use MedianStrategy fallback for mean aggregation ([b413b14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b413b1409b78beed22ca114e6feed51ab6912028))
- **core:** resolve type exports and harness issues for CI build ([1322cfc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1322cfc5936d31ba398965a63edc88d8a77604d1))
- **deps:** correct Blend SDK version to 3.2.2 ([6436d3c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6436d3ccbf29b27d982c0dca206db1fb26f76650))
- update all packages to support ES modules with .js extensions ([54337dc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/54337dc56a1ba327226950edc2c4df16620ae789))
- update ROADMAP.md to mark issue as completed (or soon to be) ([351540d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/351540d875621e944744760a52973d38e2ba4b22))

### Features

- Add `@galaxy/core-defi-protocols` package for Stellar DeFi integrations and update root package overrides. ([5224965](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/52249651ff24d3467beb865de247faa636c772a1))
- add documentation for the changes provided ([759dc13](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/759dc134ec423fc9d3bd218d9a71532461fd9dc5))
- **api:** implement WebSocket API server with real-time event streaming ([7c5ead7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7c5ead7c3dc8ea229930143e2ade945ea6ff4a05))
- **api:** implement WebSocket API server with real-time event streaming ([e52b653](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e52b653edcc1d9dcd39984144082b8b9405e2e90)), closes [#9](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/9)
- **blend:** add parseHealthFactorData method for health factor parsing ([4d33e06](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4d33e06acc2d4db08d0f360c2d55f63eeb7d364f))
- claimable balance operatons and predicates support ([a2c0297](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a2c0297b12c56084207ab3fa019911d4a3ccd3a4))
- **cli:** add Blend Protocol CLI commands ([aa82514](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/aa8251478dac62b75c753a476bc35ae5494855a2))
- **cli:** add oracle data query commands [[#102](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/102)] ([f7e1783](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f7e17835c5abaa4f8865c2669ee8d24a281de7f6))
- **cli:** add real-time data to dashboard ([c9484e1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c9484e16af5a9e47a808145bb30ce3b62201c315))
- **cli:** add REPL loop, workflows, and interactive entry point ([4b3ea7c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4b3ea7cdda64ac4ae499a2f18b4b0203ab4674dd))
- **cli:** add timeout and JSON output to transaction watch ([2505d83](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2505d8309c8252ebbb448452b5cc6b28f757e915))
- **cli:** add types and dependencies for interactive mode ([d92fe16](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d92fe16c0b80e407e916b90cdcfcbf1815ad03d7))
- **cli:** enhance stream-manager with auto-reconnection and timeout ([2fb8607](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2fb86070288146577b0b4e2b46a81ef3f7be016c))
- **cli:** implement core interactive mode modules ([5a5364e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5a5364ed18faa1e03830c6ed115df1ab52b0ee97))
- **cli:** implement fully working create command with advanced scaffolding ([b481e18](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b481e18d9ff31e5071844cfc36b6d811325f2276))
- **cli:** implement Soroban contract event streaming ([78eecb9](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/78eecb9572dfcb820cc0eb1d6c6b68efc3892298))
- **cli:** implement watch mode commands (dashboard, network, oracle) ([67595b8](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/67595b829a1e53e5671c8e4d7ec4dfa002817e84))
- **cli:** integrate interactive mode and add tests/docs ([3f55bc7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3f55bc71f69f24bb390ec5bd0bfb06d50f97f48b))
- **cli:** integrate oracle aggregator in watch command ([437b825](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/437b825c6ad7219986eeeecc9ab36bbab9449cf9))
- **core:** add defi protocols module ([2165d84](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2165d84adec6bbd5fd698ae30980a607660485a2))
- **defi-protocols:** add custom error classes ([5ff9556](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5ff95566b748f0714a8caa5b0f30ddddbdb9201f))
- **defi-protocols:** add discriminated operation types ([e91d615](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e91d61584e8a2cd205a615f80a331d92621cc19d))
- **defi-protocols:** add type guards for operations ([2faeda2](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2faeda25eaf9ff42a9c84b8953ac1fefa16f1688))
- **defi-protocols:** export new modules ([95f4980](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/95f49809d9a07aedc41783842845ee5413b54283))
- enhance Oracle System documentation and roadmap ([7b49413](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b49413552907e6e4a7bdb4f80085e4201068774))
- functions now on use-stellar.ts ([5d04d45](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5d04d45b4b2713ef87e1017fd5df0b7a623649f0))
- implement jest tests, add cli command anda final fixes ([9ee2439](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9ee2439e59f7bbb68c1b1e103c0d52c5572648ed))
- implement jest tests, add cli command anda final fixes ([cb308eb](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/cb308ebb8067e4b284cf65ea553fa886cd8244d1))
- implement oracle formatter, command group, and subcommands ([6eac895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6eac895885e346135e23bead4b9b0585b28c9a01))
- Implement Social Recovery System ([3ea2cd5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3ea2cd55a6b95f6b89e9cf4ba120c249fbba214a))
- implement unit tests for claimable balance manager and stellar services ([ed3d839](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ed3d839981261834471f3cb995248dc2393fd62f))
- Implement wallet management CLI commands ([#101](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/101)) ([6ea42d9](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6ea42d9374352f7ea3b88f613eb8b9c11d1d4e8d))
- implement wallet management commands in CLI [#95](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/95) ([4c1883e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4c1883ef2c2892f69eb44354277719f4ca8851b1))
- implement watch command for real-time monitoring and fix CI infrastructure ([8bcca2d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/8bcca2dd8389a24d73bf77647df2c779b20fe260))
- implement watch mode and upgrade linter to ESLint v9 (minimal changes) ([fec9e9d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fec9e9d1c01be05258b6d589e817a8b26ba1df45))
- initial ClaimableBalanceManager class and types ([d536c6f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d536c6f724603e52cd24a5053c18fe3698f85b23))
- initial implementation for using oracle and parsing duration (+ deps) ([7b56c5b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b56c5baa64e7636a1f0eba34bb8c23970429ebe))
- initial project structure with all packages and tools ([46e16d5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/46e16d5fc664759b4e26ba206d0c88c868e16111))
- **interactive:** add blend and watch to COMMAND_REGISTRY for tab completion ([06c056f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/06c056f0ad3fb4587a34f945d35541783af371fc))
- **interactive:** arrow-key history and Ctrl+R reverse-i-search ([c767c7b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c767c7bea648bf0a01afa331874d71d30c464cc8))
- **invisible-wallet:** add comprehensive backup system ([b9f8bda](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b9f8bda5d6cd84f05480ba8f9f9c2774d5b95478))
- **sdk:** implement Blend Protocol lending/borrowing integration ([a83b171](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a83b171d57eb0dfe4e3aa3864ee567452dc1f9ce)), closes [#21](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/21) [-#25](https://github.com/-/issues/25)
- **soroban:** Add comprehensive examples for Soroban contract operations ([2f1843c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2f1843c249b8e4e866111f38c1ec81c8edad6778))
- **soroban:** Add comprehensive test suite for Soroban utilities ([139f641](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/139f64152e22d6aafa079ec146b4b5ea68c709d1))
- **soroban:** Add core contract management and event monitoring ([fe2757b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fe2757b1eabc76c7f045945ebdf15d33ebbdd365))
- **soroban:** Add core Soroban types and module structure ([f196e14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f196e1411b2f4e68658ff43e8ddb5388a15a4bb6))
- **soroban:** Add Soroban utilities package configuration and documentation ([9283d2c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9283d2c300ebcc6950f930f32beba277a338260e))
- **soroban:** Add specialized helper classes for common patterns ([a642119](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a642119060f7a8db9bd11de5d4e4d83e063e9d15))
- **soroban:** Add specialized utility classes for error handling and events ([7566729](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7566729efc7f6a5ce3ba5ab5174179c2ff65e25e))
- **soroban:** Add utility classes for type conversion and ABI parsing ([da5511a](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/da5511a53cbc1fd0b76f1aa38fe3f3a327cf049d))
- **soroban:** Update main SDK exports to include Soroban functionality ([254dd68](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/254dd68f85ae8a88fbee034c2067387d547a45c8))
- **stellar-sdk:** add sponsored reserves builders ([c225895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c2258953d8adf575a4ca6b78d27f3f8b2d5e4a5c))
- **stellar-sdk:** add sponsored reserves manager service ([3c4183f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3c4183fc87b8ee43a065f5c566157d21ce50486f))
- **stellar-sdk:** add sponsored reserves module index ([1d1f7e4](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1d1f7e42fe4d7e65ff8f094ad91f0de8697ec662))
- **stellar-sdk:** add sponsored reserves templates ([66ab79d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/66ab79d6bbf7c9ed09be22b03f3037c12c1873ff))
- **stellar-sdk:** add sponsored reserves types ([5afc26c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5afc26cffdbe78f2f1e6a1be7d4fdc5253489559))
- **stellar-sdk:** add sponsorship validation and cost calculator utils ([c4d679e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c4d679e822c2bb49c58753e45315def850168dac))
- **stellar-sdk:** enhance claimable balances predicate builder ([1a65b55](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1a65b55b6d3eabcd430f34ee526aa63d9e80c1c9))
- **stellar-sdk:** export sponsored reserves module ([ccba36d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ccba36d7508832c3b36f9ec76c476a8de4ebe38d))

### BREAKING CHANGES

- All packages now use native ES modules.
  Consumers must ensure their environment supports ES modules.

Affected packages:

- @galaxy-kj/core-automation
- @galaxy-kj/core-defi-protocols
- @galaxy-kj/core-invisible-wallet
- @galaxy-kj/core-oracles
- @galaxy-kj/core-stellar-sdk

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>

- **soroban:** None
  FEATURE: Soroban examples and documentation
- **soroban:** None
  FEATURE: Soroban integration with main SDK exports
- **soroban:** None
  FEATURE: Complete Soroban test coverage
- **soroban:** None
  FEATURE: Soroban contract helpers and wrappers
- **soroban:** None
  FEATURE: Core Soroban contract management
- **soroban:** None
  FEATURE: Advanced Soroban utilities
- **soroban:** None
  FEATURE: Core Soroban utilities
- **soroban:** None
  FEATURE: Core Soroban type system
- **soroban:** None
  FEATURE: Add Soroban smart contract support to Galaxy SDK

# 2.0.0 (2026-01-30)

### Bug Fixes

- added helpers and fixed typescript issues ([a8f3cb1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a8f3cb13513e8b525942d249a640b3379db42e37))
- address CodeRabbitAI review comments - include network in cache key, use toBeCloseTo for float tests, fix markdown formatting ([db39d5f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/db39d5f633a59db93c2d457a85f91f6622bf0aae))
- **blend:** remove console.log and add missing Blend SDK dependency ([58468c7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/58468c72add3ee7e2cda4101e0a3088d5afab6d5))
- CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
- **ci:** remove unsupported --max-warnings flag from lint command ([1888a12](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1888a127742f79c3e49b47e5741ad9434da592bc))
- cli build was failing ([4952232](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/495223286ffd59d3ea892801b31065f029153bc3))
- **cli:** address additional CodeRabbit review feedback ([56cd6ef](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/56cd6ef0e5d0a90feab812aea62eec9e1e469887))
- **cli:** address CodeRabbit review feedback ([c5c40f7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c5c40f70ab98a106c95be83772254369fc0ffc5b))
- **cli:** sync package-lock.json with merged package.json dependencies ([9f4b54e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9f4b54e25ef3dfbe2acfd7b84b92e4d7b704fc9d))
- **cli:** use local MockOracleSource to avoid core-oracles dist export gap ([5348534](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/534853458c75232352645cb55d9a300197eaa525))
- **cli:** use MedianStrategy fallback for mean aggregation ([b413b14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b413b1409b78beed22ca114e6feed51ab6912028))
- **core:** resolve type exports and harness issues for CI build ([1322cfc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1322cfc5936d31ba398965a63edc88d8a77604d1))
- **deps:** correct Blend SDK version to 3.2.2 ([6436d3c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6436d3ccbf29b27d982c0dca206db1fb26f76650))
- update ROADMAP.md to mark issue as completed (or soon to be) ([351540d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/351540d875621e944744760a52973d38e2ba4b22))

### Features

- Add `@galaxy/core-defi-protocols` package for Stellar DeFi integrations and update root package overrides. ([5224965](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/52249651ff24d3467beb865de247faa636c772a1))
- add documentation for the changes provided ([759dc13](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/759dc134ec423fc9d3bd218d9a71532461fd9dc5))
- **api:** implement WebSocket API server with real-time event streaming ([7c5ead7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7c5ead7c3dc8ea229930143e2ade945ea6ff4a05))
- **api:** implement WebSocket API server with real-time event streaming ([e52b653](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e52b653edcc1d9dcd39984144082b8b9405e2e90)), closes [#9](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/9)
- **blend:** add parseHealthFactorData method for health factor parsing ([4d33e06](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4d33e06acc2d4db08d0f360c2d55f63eeb7d364f))
- claimable balance operatons and predicates support ([a2c0297](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a2c0297b12c56084207ab3fa019911d4a3ccd3a4))
- **cli:** add Blend Protocol CLI commands ([aa82514](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/aa8251478dac62b75c753a476bc35ae5494855a2))
- **cli:** add oracle data query commands [[#102](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/102)] ([f7e1783](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f7e17835c5abaa4f8865c2669ee8d24a281de7f6))
- **cli:** add real-time data to dashboard ([c9484e1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c9484e16af5a9e47a808145bb30ce3b62201c315))
- **cli:** add REPL loop, workflows, and interactive entry point ([4b3ea7c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4b3ea7cdda64ac4ae499a2f18b4b0203ab4674dd))
- **cli:** add timeout and JSON output to transaction watch ([2505d83](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2505d8309c8252ebbb448452b5cc6b28f757e915))
- **cli:** add types and dependencies for interactive mode ([d92fe16](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d92fe16c0b80e407e916b90cdcfcbf1815ad03d7))
- **cli:** enhance stream-manager with auto-reconnection and timeout ([2fb8607](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2fb86070288146577b0b4e2b46a81ef3f7be016c))
- **cli:** implement core interactive mode modules ([5a5364e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5a5364ed18faa1e03830c6ed115df1ab52b0ee97))
- **cli:** implement fully working create command with advanced scaffolding ([b481e18](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b481e18d9ff31e5071844cfc36b6d811325f2276))
- **cli:** implement Soroban contract event streaming ([78eecb9](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/78eecb9572dfcb820cc0eb1d6c6b68efc3892298))
- **cli:** implement watch mode commands (dashboard, network, oracle) ([67595b8](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/67595b829a1e53e5671c8e4d7ec4dfa002817e84))
- **cli:** integrate interactive mode and add tests/docs ([3f55bc7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3f55bc71f69f24bb390ec5bd0bfb06d50f97f48b))
- **cli:** integrate oracle aggregator in watch command ([437b825](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/437b825c6ad7219986eeeecc9ab36bbab9449cf9))
- **core:** add defi protocols module ([2165d84](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2165d84adec6bbd5fd698ae30980a607660485a2))
- **defi-protocols:** add custom error classes ([5ff9556](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5ff95566b748f0714a8caa5b0f30ddddbdb9201f))
- **defi-protocols:** add discriminated operation types ([e91d615](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e91d61584e8a2cd205a615f80a331d92621cc19d))
- **defi-protocols:** add type guards for operations ([2faeda2](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2faeda25eaf9ff42a9c84b8953ac1fefa16f1688))
- **defi-protocols:** export new modules ([95f4980](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/95f49809d9a07aedc41783842845ee5413b54283))
- enhance Oracle System documentation and roadmap ([7b49413](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b49413552907e6e4a7bdb4f80085e4201068774))
- functions now on use-stellar.ts ([5d04d45](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5d04d45b4b2713ef87e1017fd5df0b7a623649f0))
- implement jest tests, add cli command anda final fixes ([9ee2439](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9ee2439e59f7bbb68c1b1e103c0d52c5572648ed))
- implement jest tests, add cli command anda final fixes ([cb308eb](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/cb308ebb8067e4b284cf65ea553fa886cd8244d1))
- implement oracle formatter, command group, and subcommands ([6eac895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6eac895885e346135e23bead4b9b0585b28c9a01))
- Implement Social Recovery System ([3ea2cd5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3ea2cd55a6b95f6b89e9cf4ba120c249fbba214a))
- implement unit tests for claimable balance manager and stellar services ([ed3d839](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ed3d839981261834471f3cb995248dc2393fd62f))
- Implement wallet management CLI commands ([#101](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/101)) ([6ea42d9](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6ea42d9374352f7ea3b88f613eb8b9c11d1d4e8d))
- implement wallet management commands in CLI [#95](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/95) ([4c1883e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4c1883ef2c2892f69eb44354277719f4ca8851b1))
- implement watch command for real-time monitoring and fix CI infrastructure ([8bcca2d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/8bcca2dd8389a24d73bf77647df2c779b20fe260))
- implement watch mode and upgrade linter to ESLint v9 (minimal changes) ([fec9e9d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fec9e9d1c01be05258b6d589e817a8b26ba1df45))
- initial ClaimableBalanceManager class and types ([d536c6f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d536c6f724603e52cd24a5053c18fe3698f85b23))
- initial implementation for using oracle and parsing duration (+ deps) ([7b56c5b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b56c5baa64e7636a1f0eba34bb8c23970429ebe))
- initial project structure with all packages and tools ([46e16d5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/46e16d5fc664759b4e26ba206d0c88c868e16111))
- **interactive:** add blend and watch to COMMAND_REGISTRY for tab completion ([06c056f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/06c056f0ad3fb4587a34f945d35541783af371fc))
- **interactive:** arrow-key history and Ctrl+R reverse-i-search ([c767c7b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c767c7bea648bf0a01afa331874d71d30c464cc8))
- **invisible-wallet:** add comprehensive backup system ([b9f8bda](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b9f8bda5d6cd84f05480ba8f9f9c2774d5b95478))
- **sdk:** implement Blend Protocol lending/borrowing integration ([a83b171](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a83b171d57eb0dfe4e3aa3864ee567452dc1f9ce)), closes [#21](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/21) [-#25](https://github.com/-/issues/25)
- **soroban:** Add comprehensive examples for Soroban contract operations ([2f1843c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2f1843c249b8e4e866111f38c1ec81c8edad6778))
- **soroban:** Add comprehensive test suite for Soroban utilities ([139f641](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/139f64152e22d6aafa079ec146b4b5ea68c709d1))
- **soroban:** Add core contract management and event monitoring ([fe2757b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fe2757b1eabc76c7f045945ebdf15d33ebbdd365))
- **soroban:** Add core Soroban types and module structure ([f196e14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f196e1411b2f4e68658ff43e8ddb5388a15a4bb6))
- **soroban:** Add Soroban utilities package configuration and documentation ([9283d2c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9283d2c300ebcc6950f930f32beba277a338260e))
- **soroban:** Add specialized helper classes for common patterns ([a642119](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a642119060f7a8db9bd11de5d4e4d83e063e9d15))
- **soroban:** Add specialized utility classes for error handling and events ([7566729](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7566729efc7f6a5ce3ba5ab5174179c2ff65e25e))
- **soroban:** Add utility classes for type conversion and ABI parsing ([da5511a](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/da5511a53cbc1fd0b76f1aa38fe3f3a327cf049d))
- **soroban:** Update main SDK exports to include Soroban functionality ([254dd68](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/254dd68f85ae8a88fbee034c2067387d547a45c8))
- **stellar-sdk:** add sponsored reserves builders ([c225895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c2258953d8adf575a4ca6b78d27f3f8b2d5e4a5c))
- **stellar-sdk:** add sponsored reserves manager service ([3c4183f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3c4183fc87b8ee43a065f5c566157d21ce50486f))
- **stellar-sdk:** add sponsored reserves module index ([1d1f7e4](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1d1f7e42fe4d7e65ff8f094ad91f0de8697ec662))
- **stellar-sdk:** add sponsored reserves templates ([66ab79d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/66ab79d6bbf7c9ed09be22b03f3037c12c1873ff))
- **stellar-sdk:** add sponsored reserves types ([5afc26c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5afc26cffdbe78f2f1e6a1be7d4fdc5253489559))
- **stellar-sdk:** add sponsorship validation and cost calculator utils ([c4d679e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c4d679e822c2bb49c58753e45315def850168dac))
- **stellar-sdk:** enhance claimable balances predicate builder ([1a65b55](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1a65b55b6d3eabcd430f34ee526aa63d9e80c1c9))
- **stellar-sdk:** export sponsored reserves module ([ccba36d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ccba36d7508832c3b36f9ec76c476a8de4ebe38d))

### BREAKING CHANGES

- **soroban:** None
  FEATURE: Soroban examples and documentation
- **soroban:** None
  FEATURE: Soroban integration with main SDK exports
- **soroban:** None
  FEATURE: Complete Soroban test coverage
- **soroban:** None
  FEATURE: Soroban contract helpers and wrappers
- **soroban:** None
  FEATURE: Core Soroban contract management
- **soroban:** None
  FEATURE: Advanced Soroban utilities
- **soroban:** None
  FEATURE: Core Soroban utilities
- **soroban:** None
  FEATURE: Core Soroban type system
- **soroban:** None
  FEATURE: Add Soroban smart contract support to Galaxy SDK

# 📝 Changelog

All notable changes to Galaxy DevKit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project structure
- CLI tool with basic commands
- Stellar SDK core package
- Smart contracts (smart-swap, security-limits)
- Documentation structure

### Changed

- N/A

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- N/A

### Security

- N/A

## [1.0.0] - 2024-12-01

### Added

- Initial release of Galaxy DevKit
- CLI tool with commands: create, init, build, dev, deploy
- Stellar SDK wrapper for easy Stellar integration
- Smart contract templates for common DeFi operations
- Comprehensive documentation
- TypeScript support throughout
- Supabase integration for database operations

### Features

- **CLI Commands**
  - `galaxy create <project-name>` - Create new Stellar projects
  - `galaxy init` - Initialize Galaxy DevKit in current directory
  - `galaxy build` - Build projects for production
  - `galaxy dev` - Start development server
  - `galaxy deploy` - Deploy to production
  - `galaxy help` - Show help information

- **Stellar SDK**
  - Wallet creation and management
  - Transaction processing
  - Account operations
  - Network switching (testnet/mainnet)
  - Balance tracking

- **Smart Contracts**
  - Smart swap contract for token exchanges
  - Security limits contract for transaction controls
  - Rust-based Soroban contracts

- **Documentation**
  - API reference with examples
  - CLI guide with all commands
  - Architecture documentation
  - Contributing guidelines
  - Real-world examples

### Technical Details

- **Monorepo Structure**: Lerna-based monorepo for package management
- **TypeScript**: Full TypeScript support with strict mode
- **Rust**: Smart contracts written in Rust for Soroban
- **Supabase**: Database and backend services
- **CLI**: Commander.js-based command line interface

### Project Structure

```
galaxy-devkit/
├── packages/
│   └── core/
│       └── stellar-sdk/     # Stellar SDK wrapper
├── tools/
│   └── cli/                 # CLI implementation
├── contracts/               # Smart contracts (Rust)
│   ├── smart-swap/
│   └── security-limits/
├── supabase/                # Database configuration
├── docs/                    # Documentation
└── README.md                # Project documentation
```

### Breaking Changes

- N/A (Initial release)

### Migration Guide

- N/A (Initial release)

---

**Galaxy DevKit - Built for the Stellar ecosystem** 🌟
