# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# 4.0.0 (2026-02-04)


### Bug Fixes

* add .js extensions to soroswap imports and resolve merge conflicts ([195b230](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/195b2300620fbe191f956eb8d0726f7b237c8a4e))
* **blend:** remove console.log and add missing Blend SDK dependency ([58468c7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/58468c72add3ee7e2cda4101e0a3088d5afab6d5))
* CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
* cli build was failing ([4952232](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/495223286ffd59d3ea892801b31065f029153bc3))
* **deps:** correct Blend SDK version to 3.2.2 ([6436d3c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6436d3ccbf29b27d982c0dca206db1fb26f76650))
* update all packages to support ES modules with .js extensions ([54337dc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/54337dc56a1ba327226950edc2c4df16620ae789))


### Features

* Add `@galaxy/core-defi-protocols` package for Stellar DeFi integrations and update root package overrides. ([5224965](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/52249651ff24d3467beb865de247faa636c772a1))
* **blend:** add parseHealthFactorData method for health factor parsing ([4d33e06](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4d33e06acc2d4db08d0f360c2d55f63eeb7d364f))
* **cli:** add protocol interaction commands ([d863c62](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d863c625d69b55b060ebe754ba1f98a496cbed39))
* **cli:** add protocol interaction commands ([b94fb0b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b94fb0b1408ee77b25210705e03a4825b10cd92d))
* **core:** add defi protocols module ([2165d84](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2165d84adec6bbd5fd698ae30980a607660485a2))
* **defi-protocols:** add custom error classes ([5ff9556](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5ff95566b748f0714a8caa5b0f30ddddbdb9201f))
* **defi-protocols:** add discriminated operation types ([e91d615](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e91d61584e8a2cd205a615f80a331d92621cc19d))
* **defi-protocols:** add type guards for operations ([2faeda2](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2faeda25eaf9ff42a9c84b8953ac1fefa16f1688))
* **defi-protocols:** export new modules ([95f4980](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/95f49809d9a07aedc41783842845ee5413b54283))
* **defi:** implement core Soroswap DEX protocol service ([4390c15](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4390c15026d0f570571f6eff2f1a4878335bb153)), closes [#27](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/27) [-#30](https://github.com/-/issues/30)
* Implement Social Recovery System ([3ea2cd5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3ea2cd55a6b95f6b89e9cf4ba120c249fbba214a))
* **sdk:** implement Blend Protocol lending/borrowing integration ([a83b171](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a83b171d57eb0dfe4e3aa3864ee567452dc1f9ce)), closes [#21](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/21) [-#25](https://github.com/-/issues/25)


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





# 3.0.0 (2026-02-04)


### Bug Fixes

* add .js extensions to soroswap imports and resolve merge conflicts ([195b230](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/195b2300620fbe191f956eb8d0726f7b237c8a4e))
* **blend:** remove console.log and add missing Blend SDK dependency ([58468c7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/58468c72add3ee7e2cda4101e0a3088d5afab6d5))
* CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
* cli build was failing ([4952232](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/495223286ffd59d3ea892801b31065f029153bc3))
* **deps:** correct Blend SDK version to 3.2.2 ([6436d3c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6436d3ccbf29b27d982c0dca206db1fb26f76650))
* update all packages to support ES modules with .js extensions ([54337dc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/54337dc56a1ba327226950edc2c4df16620ae789))


### Features

* Add `@galaxy/core-defi-protocols` package for Stellar DeFi integrations and update root package overrides. ([5224965](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/52249651ff24d3467beb865de247faa636c772a1))
* **blend:** add parseHealthFactorData method for health factor parsing ([4d33e06](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4d33e06acc2d4db08d0f360c2d55f63eeb7d364f))
* **cli:** add protocol interaction commands ([d863c62](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/d863c625d69b55b060ebe754ba1f98a496cbed39))
* **cli:** add protocol interaction commands ([b94fb0b](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/b94fb0b1408ee77b25210705e03a4825b10cd92d))
* **core:** add defi protocols module ([2165d84](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2165d84adec6bbd5fd698ae30980a607660485a2))
* **defi-protocols:** add custom error classes ([5ff9556](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5ff95566b748f0714a8caa5b0f30ddddbdb9201f))
* **defi-protocols:** add discriminated operation types ([e91d615](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e91d61584e8a2cd205a615f80a331d92621cc19d))
* **defi-protocols:** add type guards for operations ([2faeda2](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2faeda25eaf9ff42a9c84b8953ac1fefa16f1688))
* **defi-protocols:** export new modules ([95f4980](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/95f49809d9a07aedc41783842845ee5413b54283))
* **defi:** implement core Soroswap DEX protocol service ([4390c15](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4390c15026d0f570571f6eff2f1a4878335bb153)), closes [#27](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/27) [-#30](https://github.com/-/issues/30)
* Implement Social Recovery System ([3ea2cd5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3ea2cd55a6b95f6b89e9cf4ba120c249fbba214a))
* **sdk:** implement Blend Protocol lending/borrowing integration ([a83b171](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a83b171d57eb0dfe4e3aa3864ee567452dc1f9ce)), closes [#21](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/21) [-#25](https://github.com/-/issues/25)


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





# 2.1.0 (2026-02-04)


### Bug Fixes

* **blend:** remove console.log and add missing Blend SDK dependency ([58468c7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/58468c72add3ee7e2cda4101e0a3088d5afab6d5))
* CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
* cli build was failing ([4952232](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/495223286ffd59d3ea892801b31065f029153bc3))
* **deps:** correct Blend SDK version to 3.2.2 ([6436d3c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6436d3ccbf29b27d982c0dca206db1fb26f76650))
* update all packages to support ES modules with .js extensions ([54337dc](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/54337dc56a1ba327226950edc2c4df16620ae789))


### Features

* Add `@galaxy/core-defi-protocols` package for Stellar DeFi integrations and update root package overrides. ([5224965](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/52249651ff24d3467beb865de247faa636c772a1))
* **blend:** add parseHealthFactorData method for health factor parsing ([4d33e06](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4d33e06acc2d4db08d0f360c2d55f63eeb7d364f))
* **core:** add defi protocols module ([2165d84](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2165d84adec6bbd5fd698ae30980a607660485a2))
* **defi-protocols:** add custom error classes ([5ff9556](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5ff95566b748f0714a8caa5b0f30ddddbdb9201f))
* **defi-protocols:** add discriminated operation types ([e91d615](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e91d61584e8a2cd205a615f80a331d92621cc19d))
* **defi-protocols:** add type guards for operations ([2faeda2](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2faeda25eaf9ff42a9c84b8953ac1fefa16f1688))
* **defi-protocols:** export new modules ([95f4980](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/95f49809d9a07aedc41783842845ee5413b54283))
* Implement Social Recovery System ([3ea2cd5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3ea2cd55a6b95f6b89e9cf4ba120c249fbba214a))
* **sdk:** implement Blend Protocol lending/borrowing integration ([a83b171](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a83b171d57eb0dfe4e3aa3864ee567452dc1f9ce)), closes [#21](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/21) [-#25](https://github.com/-/issues/25)


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





# 2.0.0 (2026-01-30)


### Bug Fixes

* **blend:** remove console.log and add missing Blend SDK dependency ([58468c7](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/58468c72add3ee7e2cda4101e0a3088d5afab6d5))
* CI/CD was failing ([7b6180d](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/7b6180d867997ef0e4b3e83c5516f292a27b8d73))
* cli build was failing ([4952232](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/495223286ffd59d3ea892801b31065f029153bc3))
* **deps:** correct Blend SDK version to 3.2.2 ([6436d3c](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/6436d3ccbf29b27d982c0dca206db1fb26f76650))


### Features

* Add `@galaxy/core-defi-protocols` package for Stellar DeFi integrations and update root package overrides. ([5224965](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/52249651ff24d3467beb865de247faa636c772a1))
* **blend:** add parseHealthFactorData method for health factor parsing ([4d33e06](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/4d33e06acc2d4db08d0f360c2d55f63eeb7d364f))
* **core:** add defi protocols module ([2165d84](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2165d84adec6bbd5fd698ae30980a607660485a2))
* **defi-protocols:** add custom error classes ([5ff9556](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/5ff95566b748f0714a8caa5b0f30ddddbdb9201f))
* **defi-protocols:** add discriminated operation types ([e91d615](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/e91d61584e8a2cd205a615f80a331d92621cc19d))
* **defi-protocols:** add type guards for operations ([2faeda2](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/2faeda25eaf9ff42a9c84b8953ac1fefa16f1688))
* **defi-protocols:** export new modules ([95f4980](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/95f49809d9a07aedc41783842845ee5413b54283))
* Implement Social Recovery System ([3ea2cd5](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/3ea2cd55a6b95f6b89e9cf4ba120c249fbba214a))
* **sdk:** implement Blend Protocol lending/borrowing integration ([a83b171](https://github.com/Galaxy-KJ/Galaxy-DevKit/commit/a83b171d57eb0dfe4e3aa3864ee567452dc1f9ce)), closes [#21](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/21) [-#25](https://github.com/-/issues/25)
