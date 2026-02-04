# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# 4.0.0 (2026-02-04)


### Bug Fixes

* added helpers and fixed typescript issues ([a8f3cb1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a8f3cb13513e8b525942d249a640b3379db42e37))
* CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
* update all packages to support ES modules with .js extensions ([54337dc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/54337dc56a1ba327226950edc2c4df16620ae789))


### Features

* add documentation for the changes provided ([759dc13](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/759dc134ec423fc9d3bd218d9a71532461fd9dc5))
* claimable balance operatons and predicates support ([a2c0297](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a2c0297b12c56084207ab3fa019911d4a3ccd3a4))
* functions now on use-stellar.ts ([5d04d45](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5d04d45b4b2713ef87e1017fd5df0b7a623649f0))
* implement unit tests for claimable balance manager and stellar services ([ed3d839](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ed3d839981261834471f3cb995248dc2393fd62f))
* Implementation Path Payment (Swap) Improvements ([0c55948](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/0c55948170dda5943216765ab2da91a9b6c0e4b9))
* initial ClaimableBalanceManager class and types ([d536c6f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d536c6f724603e52cd24a5053c18fe3698f85b23))
* initial project structure with all packages and tools ([46e16d5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/46e16d5fc664759b4e26ba206d0c88c868e16111))
* **soroban:** Add comprehensive test suite for Soroban utilities ([139f641](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/139f64152e22d6aafa079ec146b4b5ea68c709d1))
* **soroban:** Add core contract management and event monitoring ([fe2757b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fe2757b1eabc76c7f045945ebdf15d33ebbdd365))
* **soroban:** Add core Soroban types and module structure ([f196e14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f196e1411b2f4e68658ff43e8ddb5388a15a4bb6))
* **soroban:** Add Soroban utilities package configuration and documentation ([9283d2c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9283d2c300ebcc6950f930f32beba277a338260e))
* **soroban:** Add specialized helper classes for common patterns ([a642119](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a642119060f7a8db9bd11de5d4e4d83e063e9d15))
* **soroban:** Add specialized utility classes for error handling and events ([7566729](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7566729efc7f6a5ce3ba5ab5174179c2ff65e25e))
* **soroban:** Add utility classes for type conversion and ABI parsing ([da5511a](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/da5511a53cbc1fd0b76f1aa38fe3f3a327cf049d))
* **soroban:** Update main SDK exports to include Soroban functionality ([254dd68](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/254dd68f85ae8a88fbee034c2067387d547a45c8))
* **stellar-sdk:** add sponsored reserves builders ([c225895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c2258953d8adf575a4ca6b78d27f3f8b2d5e4a5c))
* **stellar-sdk:** add sponsored reserves manager service ([3c4183f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3c4183fc87b8ee43a065f5c566157d21ce50486f))
* **stellar-sdk:** add sponsored reserves module index ([1d1f7e4](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1d1f7e42fe4d7e65ff8f094ad91f0de8697ec662))
* **stellar-sdk:** add sponsored reserves templates ([66ab79d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/66ab79d6bbf7c9ed09be22b03f3037c12c1873ff))
* **stellar-sdk:** add sponsored reserves types ([5afc26c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5afc26cffdbe78f2f1e6a1be7d4fdc5253489559))
* **stellar-sdk:** add sponsorship validation and cost calculator utils ([c4d679e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c4d679e822c2bb49c58753e45315def850168dac))
* **stellar-sdk:** enhance claimable balances predicate builder ([1a65b55](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1a65b55b6d3eabcd430f34ee526aa63d9e80c1c9))
* **stellar-sdk:** export sponsored reserves module ([ccba36d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ccba36d7508832c3b36f9ec76c476a8de4ebe38d))


### BREAKING CHANGES

* All packages now use native ES modules.
Consumers must ensure their environment supports ES modules.

Affected packages:
- @galaxy-kj/core-automation
- @galaxy-kj/core-defi-protocols
- @galaxy-kj/core-invisible-wallet
- @galaxy-kj/core-oracles
- @galaxy-kj/core-stellar-sdk

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
* **soroban:** None
FEATURE: Soroban integration with main SDK exports
* **soroban:** None
FEATURE: Complete Soroban test coverage
* **soroban:** None
FEATURE: Soroban contract helpers and wrappers
* **soroban:** None
FEATURE: Core Soroban contract management
* **soroban:** None
FEATURE: Advanced Soroban utilities
* **soroban:** None
FEATURE: Core Soroban utilities
* **soroban:** None
FEATURE: Core Soroban type system
* **soroban:** None
FEATURE: Add Soroban smart contract support to Galaxy SDK





# 3.0.0 (2026-02-04)


### Bug Fixes

* added helpers and fixed typescript issues ([a8f3cb1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a8f3cb13513e8b525942d249a640b3379db42e37))
* CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
* update all packages to support ES modules with .js extensions ([54337dc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/54337dc56a1ba327226950edc2c4df16620ae789))


### Features

* add documentation for the changes provided ([759dc13](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/759dc134ec423fc9d3bd218d9a71532461fd9dc5))
* claimable balance operatons and predicates support ([a2c0297](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a2c0297b12c56084207ab3fa019911d4a3ccd3a4))
* functions now on use-stellar.ts ([5d04d45](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5d04d45b4b2713ef87e1017fd5df0b7a623649f0))
* implement unit tests for claimable balance manager and stellar services ([ed3d839](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ed3d839981261834471f3cb995248dc2393fd62f))
* Implementation Path Payment (Swap) Improvements ([0c55948](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/0c55948170dda5943216765ab2da91a9b6c0e4b9))
* initial ClaimableBalanceManager class and types ([d536c6f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d536c6f724603e52cd24a5053c18fe3698f85b23))
* initial project structure with all packages and tools ([46e16d5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/46e16d5fc664759b4e26ba206d0c88c868e16111))
* **soroban:** Add comprehensive test suite for Soroban utilities ([139f641](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/139f64152e22d6aafa079ec146b4b5ea68c709d1))
* **soroban:** Add core contract management and event monitoring ([fe2757b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fe2757b1eabc76c7f045945ebdf15d33ebbdd365))
* **soroban:** Add core Soroban types and module structure ([f196e14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f196e1411b2f4e68658ff43e8ddb5388a15a4bb6))
* **soroban:** Add Soroban utilities package configuration and documentation ([9283d2c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9283d2c300ebcc6950f930f32beba277a338260e))
* **soroban:** Add specialized helper classes for common patterns ([a642119](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a642119060f7a8db9bd11de5d4e4d83e063e9d15))
* **soroban:** Add specialized utility classes for error handling and events ([7566729](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7566729efc7f6a5ce3ba5ab5174179c2ff65e25e))
* **soroban:** Add utility classes for type conversion and ABI parsing ([da5511a](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/da5511a53cbc1fd0b76f1aa38fe3f3a327cf049d))
* **soroban:** Update main SDK exports to include Soroban functionality ([254dd68](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/254dd68f85ae8a88fbee034c2067387d547a45c8))
* **stellar-sdk:** add sponsored reserves builders ([c225895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c2258953d8adf575a4ca6b78d27f3f8b2d5e4a5c))
* **stellar-sdk:** add sponsored reserves manager service ([3c4183f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3c4183fc87b8ee43a065f5c566157d21ce50486f))
* **stellar-sdk:** add sponsored reserves module index ([1d1f7e4](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1d1f7e42fe4d7e65ff8f094ad91f0de8697ec662))
* **stellar-sdk:** add sponsored reserves templates ([66ab79d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/66ab79d6bbf7c9ed09be22b03f3037c12c1873ff))
* **stellar-sdk:** add sponsored reserves types ([5afc26c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5afc26cffdbe78f2f1e6a1be7d4fdc5253489559))
* **stellar-sdk:** add sponsorship validation and cost calculator utils ([c4d679e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c4d679e822c2bb49c58753e45315def850168dac))
* **stellar-sdk:** enhance claimable balances predicate builder ([1a65b55](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1a65b55b6d3eabcd430f34ee526aa63d9e80c1c9))
* **stellar-sdk:** export sponsored reserves module ([ccba36d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ccba36d7508832c3b36f9ec76c476a8de4ebe38d))


### BREAKING CHANGES

* All packages now use native ES modules.
Consumers must ensure their environment supports ES modules.

Affected packages:
- @galaxy-kj/core-automation
- @galaxy-kj/core-defi-protocols
- @galaxy-kj/core-invisible-wallet
- @galaxy-kj/core-oracles
- @galaxy-kj/core-stellar-sdk

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
* **soroban:** None
FEATURE: Soroban integration with main SDK exports
* **soroban:** None
FEATURE: Complete Soroban test coverage
* **soroban:** None
FEATURE: Soroban contract helpers and wrappers
* **soroban:** None
FEATURE: Core Soroban contract management
* **soroban:** None
FEATURE: Advanced Soroban utilities
* **soroban:** None
FEATURE: Core Soroban utilities
* **soroban:** None
FEATURE: Core Soroban type system
* **soroban:** None
FEATURE: Add Soroban smart contract support to Galaxy SDK





# 2.1.0 (2026-02-04)


### Bug Fixes

* added helpers and fixed typescript issues ([a8f3cb1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a8f3cb13513e8b525942d249a640b3379db42e37))
* CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
* update all packages to support ES modules with .js extensions ([54337dc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/54337dc56a1ba327226950edc2c4df16620ae789))


### Features

* add documentation for the changes provided ([759dc13](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/759dc134ec423fc9d3bd218d9a71532461fd9dc5))
* claimable balance operatons and predicates support ([a2c0297](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a2c0297b12c56084207ab3fa019911d4a3ccd3a4))
* functions now on use-stellar.ts ([5d04d45](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5d04d45b4b2713ef87e1017fd5df0b7a623649f0))
* implement unit tests for claimable balance manager and stellar services ([ed3d839](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ed3d839981261834471f3cb995248dc2393fd62f))
* initial ClaimableBalanceManager class and types ([d536c6f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d536c6f724603e52cd24a5053c18fe3698f85b23))
* initial project structure with all packages and tools ([46e16d5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/46e16d5fc664759b4e26ba206d0c88c868e16111))
* **soroban:** Add comprehensive test suite for Soroban utilities ([139f641](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/139f64152e22d6aafa079ec146b4b5ea68c709d1))
* **soroban:** Add core contract management and event monitoring ([fe2757b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fe2757b1eabc76c7f045945ebdf15d33ebbdd365))
* **soroban:** Add core Soroban types and module structure ([f196e14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f196e1411b2f4e68658ff43e8ddb5388a15a4bb6))
* **soroban:** Add Soroban utilities package configuration and documentation ([9283d2c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9283d2c300ebcc6950f930f32beba277a338260e))
* **soroban:** Add specialized helper classes for common patterns ([a642119](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a642119060f7a8db9bd11de5d4e4d83e063e9d15))
* **soroban:** Add specialized utility classes for error handling and events ([7566729](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7566729efc7f6a5ce3ba5ab5174179c2ff65e25e))
* **soroban:** Add utility classes for type conversion and ABI parsing ([da5511a](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/da5511a53cbc1fd0b76f1aa38fe3f3a327cf049d))
* **soroban:** Update main SDK exports to include Soroban functionality ([254dd68](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/254dd68f85ae8a88fbee034c2067387d547a45c8))
* **stellar-sdk:** add sponsored reserves builders ([c225895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c2258953d8adf575a4ca6b78d27f3f8b2d5e4a5c))
* **stellar-sdk:** add sponsored reserves manager service ([3c4183f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3c4183fc87b8ee43a065f5c566157d21ce50486f))
* **stellar-sdk:** add sponsored reserves module index ([1d1f7e4](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1d1f7e42fe4d7e65ff8f094ad91f0de8697ec662))
* **stellar-sdk:** add sponsored reserves templates ([66ab79d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/66ab79d6bbf7c9ed09be22b03f3037c12c1873ff))
* **stellar-sdk:** add sponsored reserves types ([5afc26c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5afc26cffdbe78f2f1e6a1be7d4fdc5253489559))
* **stellar-sdk:** add sponsorship validation and cost calculator utils ([c4d679e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c4d679e822c2bb49c58753e45315def850168dac))
* **stellar-sdk:** enhance claimable balances predicate builder ([1a65b55](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1a65b55b6d3eabcd430f34ee526aa63d9e80c1c9))
* **stellar-sdk:** export sponsored reserves module ([ccba36d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ccba36d7508832c3b36f9ec76c476a8de4ebe38d))


### BREAKING CHANGES

* All packages now use native ES modules.
Consumers must ensure their environment supports ES modules.

Affected packages:
- @galaxy-kj/core-automation
- @galaxy-kj/core-defi-protocols
- @galaxy-kj/core-invisible-wallet
- @galaxy-kj/core-oracles
- @galaxy-kj/core-stellar-sdk

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
* **soroban:** None
FEATURE: Soroban integration with main SDK exports
* **soroban:** None
FEATURE: Complete Soroban test coverage
* **soroban:** None
FEATURE: Soroban contract helpers and wrappers
* **soroban:** None
FEATURE: Core Soroban contract management
* **soroban:** None
FEATURE: Advanced Soroban utilities
* **soroban:** None
FEATURE: Core Soroban utilities
* **soroban:** None
FEATURE: Core Soroban type system
* **soroban:** None
FEATURE: Add Soroban smart contract support to Galaxy SDK





# 2.0.0 (2026-01-30)


### Bug Fixes

* added helpers and fixed typescript issues ([a8f3cb1](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a8f3cb13513e8b525942d249a640b3379db42e37))
* CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))


### Features

* add documentation for the changes provided ([759dc13](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/759dc134ec423fc9d3bd218d9a71532461fd9dc5))
* claimable balance operatons and predicates support ([a2c0297](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a2c0297b12c56084207ab3fa019911d4a3ccd3a4))
* functions now on use-stellar.ts ([5d04d45](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5d04d45b4b2713ef87e1017fd5df0b7a623649f0))
* implement unit tests for claimable balance manager and stellar services ([ed3d839](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ed3d839981261834471f3cb995248dc2393fd62f))
* initial ClaimableBalanceManager class and types ([d536c6f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d536c6f724603e52cd24a5053c18fe3698f85b23))
* initial project structure with all packages and tools ([46e16d5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/46e16d5fc664759b4e26ba206d0c88c868e16111))
* **soroban:** Add comprehensive test suite for Soroban utilities ([139f641](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/139f64152e22d6aafa079ec146b4b5ea68c709d1))
* **soroban:** Add core contract management and event monitoring ([fe2757b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/fe2757b1eabc76c7f045945ebdf15d33ebbdd365))
* **soroban:** Add core Soroban types and module structure ([f196e14](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/f196e1411b2f4e68658ff43e8ddb5388a15a4bb6))
* **soroban:** Add Soroban utilities package configuration and documentation ([9283d2c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/9283d2c300ebcc6950f930f32beba277a338260e))
* **soroban:** Add specialized helper classes for common patterns ([a642119](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a642119060f7a8db9bd11de5d4e4d83e063e9d15))
* **soroban:** Add specialized utility classes for error handling and events ([7566729](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7566729efc7f6a5ce3ba5ab5174179c2ff65e25e))
* **soroban:** Add utility classes for type conversion and ABI parsing ([da5511a](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/da5511a53cbc1fd0b76f1aa38fe3f3a327cf049d))
* **soroban:** Update main SDK exports to include Soroban functionality ([254dd68](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/254dd68f85ae8a88fbee034c2067387d547a45c8))
* **stellar-sdk:** add sponsored reserves builders ([c225895](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c2258953d8adf575a4ca6b78d27f3f8b2d5e4a5c))
* **stellar-sdk:** add sponsored reserves manager service ([3c4183f](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3c4183fc87b8ee43a065f5c566157d21ce50486f))
* **stellar-sdk:** add sponsored reserves module index ([1d1f7e4](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1d1f7e42fe4d7e65ff8f094ad91f0de8697ec662))
* **stellar-sdk:** add sponsored reserves templates ([66ab79d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/66ab79d6bbf7c9ed09be22b03f3037c12c1873ff))
* **stellar-sdk:** add sponsored reserves types ([5afc26c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5afc26cffdbe78f2f1e6a1be7d4fdc5253489559))
* **stellar-sdk:** add sponsorship validation and cost calculator utils ([c4d679e](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/c4d679e822c2bb49c58753e45315def850168dac))
* **stellar-sdk:** enhance claimable balances predicate builder ([1a65b55](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/1a65b55b6d3eabcd430f34ee526aa63d9e80c1c9))
* **stellar-sdk:** export sponsored reserves module ([ccba36d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/ccba36d7508832c3b36f9ec76c476a8de4ebe38d))


### BREAKING CHANGES

* **soroban:** None
FEATURE: Soroban integration with main SDK exports
* **soroban:** None
FEATURE: Complete Soroban test coverage
* **soroban:** None
FEATURE: Soroban contract helpers and wrappers
* **soroban:** None
FEATURE: Core Soroban contract management
* **soroban:** None
FEATURE: Advanced Soroban utilities
* **soroban:** None
FEATURE: Core Soroban utilities
* **soroban:** None
FEATURE: Core Soroban type system
* **soroban:** None
FEATURE: Add Soroban smart contract support to Galaxy SDK
