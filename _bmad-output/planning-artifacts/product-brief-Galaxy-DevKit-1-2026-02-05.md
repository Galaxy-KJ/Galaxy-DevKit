---
stepsCompleted: [1, 2]
inputDocuments:
  - docs/index.md
  - docs/architecture/index.md
  - docs/architecture/architecture.md
  - docs/guides/getting-started.md
  - docs/guides/user-guide.md
  - docs/guides/cli-guide.md
  - docs/api/api-reference.md
  - docs/api/index.md
  - docs/examples/examples.md
  - docs/examples/index.md
  - docs/cli/interactive.md
  - docs/cli/oracle.md
  - docs/cli/wallet.md
  - docs/cli/blend.md
  - docs/cli/watch.md
  - docs/cli/protocol.md
  - docs/AI.md
  - docs/ARCHITECTURE.md
  - docs/CONTRIBUTING.md
date: 2026-02-05
author: Kevinbrenes
---

# Product Brief: Galaxy-DevKit-1

## Executive Summary

Galaxy DevKit is a comprehensive, Stellar-native development framework that unifies DeFi protocols with invisible wallet technology, abstracting blockchain complexity to deliver a Web2-like development and user experience. It enables developers with zero Web3 knowledge to build sophisticated financial applications on Stellar, while end users interact with DeFi products without ever managing keys, seed phrases, or signing transactions manually. The framework provides APIs (REST, WebSocket), CLI tools, TypeScript SDKs, and Soroban smart contract templates -- all designed to make Stellar DeFi accessible to the broader developer and user ecosystem.

---

## Core Vision

### Problem Statement

The Stellar DeFi ecosystem suffers from two critical barriers that limit adoption:

1. **Developer Friction:** Building DeFi applications on Stellar requires deep knowledge of XDR encoding, Soroban contract internals, keypair management, transaction simulation, and protocol-specific SDKs. Each DeFi protocol (Blend for lending, Soroswap for swaps) has its own integration complexity, forcing developers to master multiple low-level interfaces.

2. **User Complexity:** End users must manage private keys, seed phrases, and manually sign transactions -- concepts that are alien and intimidating to mainstream users accustomed to Web2 authentication patterns (email/password, OAuth, biometrics).

### Problem Impact

- **For Developers:** Integration with a single DeFi protocol can take weeks of learning and development. Multi-protocol applications multiply this complexity. Web2 developers -- the largest pool of potential builders -- are effectively locked out.
- **For Users:** The requirement to manage cryptographic keys creates abandonment rates of 90%+ during onboarding. Users who do persist face constant anxiety about key loss and irreversible transactions.
- **For the Ecosystem:** Stellar's DeFi ecosystem remains fragmented and underutilized, with each protocol operating as an isolated island. The total developer community stays small, limiting innovation and liquidity.

### Why Existing Solutions Fall Short

- **Protocol-specific SDKs** (e.g., `@blend-capital/blend-sdk`) solve one integration at a time but don't unify the DeFi experience or address wallet complexity.
- **Generic blockchain toolkits** are not optimized for Stellar's unique features (path payments, anchors, sponsored reserves, Soroban).
- **Existing wallet solutions** force users into the "manage your own keys" paradigm rather than abstracting it away entirely.
- **No existing tool** combines DeFi protocol unification with invisible wallet technology in a single, developer-friendly framework.

### Proposed Solution

Galaxy DevKit provides a unified development framework with three core pillars:

1. **Unified DeFi Layer:** A single SDK that abstracts all Stellar DeFi protocols (lending via Blend, swaps via Soroswap, liquidity pools, oracles) behind consistent, Web2-style APIs. Developers call `protocol.supply()` or `protocol.swap()` without understanding Soroban internals.

2. **Invisible Wallet Technology:** A key management system where users never see private keys. Wallet creation, transaction signing, backup (Shamir Secret Sharing, BIP39 mnemonics), and recovery happen behind the scenes. Users authenticate with familiar patterns while the framework handles all cryptographic operations.

3. **Full-Stack Developer Toolkit:** REST APIs, WebSocket real-time feeds, CLI tools, TypeScript SDKs, Soroban smart contract templates, and a Supabase-backed persistence layer -- everything a developer needs to go from idea to deployed DeFi application.

### Key Differentiators

- **Zero Web3 Knowledge Required:** Web2 developers can build DeFi apps using familiar REST/API patterns without learning blockchain concepts.
- **Invisible Wallet UX:** End users interact with DeFi products as naturally as they use any Web2 application -- no keys, no seed phrases, no manual signing.
- **Stellar-Native Optimization:** Built specifically for Stellar's architecture, leveraging unique features like path payments, sponsored reserves, and the Stellar DEX that have no equivalent on other chains.
- **Protocol Unification:** One framework to access all major Stellar DeFi protocols, with a factory pattern that makes adding new protocols seamless.
- **Production-Ready Infrastructure:** Database schemas, authentication middleware, session management, and deployment tools included -- not just a library, but a complete application foundation.
