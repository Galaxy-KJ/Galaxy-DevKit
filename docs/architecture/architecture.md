# Galaxy DevKit Architecture Overview

This document maps the current Galaxy DevKit codebase to the Soroban smart wallet, session key, oracle, and DeFi aggregation flows that now exist in the repository.

## Scope

- `packages/core/wallet`
- `packages/core/wallet/auth`
- `packages/core/defi-protocols`
- `packages/core/oracles`
- `packages/contracts/smart-wallet-account`
- `packages/api/*`

## System Overview

```mermaid
flowchart LR
    Apps["Apps and SDK consumers"] --> Wallet["Smart wallet service and auth"]
    Apps --> Defi["DeFi protocol and routing layer"]
    Apps --> Api["REST / GraphQL / WebSocket APIs"]

    Wallet --> Auth["WebAuthn provider and session key manager"]
    Wallet --> Contracts["Soroban smart wallet contracts"]
    Wallet --> Stellar["Stellar RPC / network"]

    Defi --> Wallet
    Defi --> Aggregators["Protocol adapters and route selection"]
    Aggregators --> Stellar

    Api --> Wallet
    Api --> Defi
    Api --> Oracles["Oracle and automation services"]

    Oracles --> Automation["Automation engine"]
    Automation --> Wallet
    Automation --> Stellar
    Contracts --> Stellar
```

## Package Dependency Graph

```mermaid
flowchart TD
    WalletAuth["packages/core/wallet/auth"] --> WalletCore["packages/core/wallet"]
    WalletCore --> StellarSdk["packages/core/stellar-sdk"]
    WalletCore --> Contracts["packages/contracts/smart-wallet-account"]

    Defi["packages/core/defi-protocols"] --> WalletCore
    Defi --> StellarSdk

    Oracles["packages/core/oracles"] --> Automation["packages/core/automation"]
    Automation --> WalletCore
    Automation --> Defi

    Rest["packages/api/rest"] --> WalletCore
    Rest --> Defi
    Rest --> Automation

    Graphql["packages/api/graphql"] --> WalletCore
    Websocket["packages/api/websocket"] --> WalletCore
    Websocket --> Automation
```

## Smart Wallet Components

```mermaid
flowchart LR
    Factory["Factory contract"] --> Wallet["Wallet contract"]
    Common["Common contract crate"] --> Factory
    Common --> Wallet

    WalletService["SmartWalletService"] --> Factory
    WalletService --> Wallet
    SessionKeys["SessionKeyManager"] --> WalletService
    WebAuthn["WebAuthNProvider"] --> WalletService
```

- The factory deploys deterministic wallet contracts keyed by the admin credential ID.
- The wallet contract stores admin signers in persistent storage and session signers in temporary storage.
- `SmartWalletService` now encapsulates factory deploy transaction construction and session signer revocation.

## Current Runtime Flows

### Smart Wallet Auth Flow

The passkey-driven Soroban auth path is documented in [smart-wallet-auth-flow.md](./smart-wallet-auth-flow.md).

### Session Key Lifecycle

The short-lived delegate signer flow is documented in [session-key-flow.md](./session-key-flow.md).

### DeFi Aggregation

The route selection and signing path is documented in [defi-aggregation-flow.md](./defi-aggregation-flow.md).

### Oracle and Automation Loop

```mermaid
sequenceDiagram
    participant Oracle as Oracle service
    participant Automation as Automation engine
    participant Wallet as SessionKeyManager
    participant Service as SmartWalletService
    participant Stellar as Stellar network

    Oracle->>Automation: Publish price / threshold signal
    Automation->>Wallet: Check active session or request one
    Wallet->>Service: signWithSessionKey(...) or addSigner(...)
    Service->>Stellar: Simulate and assemble XDR
    Automation->>Stellar: Submit sponsored transaction
    Stellar-->>Automation: Ledger result and events
```

## Complete Swap Data Flow

```mermaid
sequenceDiagram
    participant App as App / bot
    participant Defi as DeFi router
    participant Wallet as SessionKeyManager
    participant Service as SmartWalletService
    participant Sponsor as Fee sponsor
    participant Stellar as Stellar network

    App->>Defi: Request quote for swap
    Defi-->>App: Best route and Soroban call data
    App->>Wallet: Sign route transaction
    Wallet->>Service: signWithSessionKey(contract, tx, sessionCredentialId)
    Service-->>Wallet: Fee-less signed XDR
    App->>Sponsor: Send XDR for sponsorship
    Sponsor->>Stellar: Submit fee-bumped transaction
    Stellar-->>App: Transaction hash and status
```

## Related Docs

- [Smart wallet auth flow](./smart-wallet-auth-flow.md)
- [Session key flow](./session-key-flow.md)
- [DeFi aggregation flow](./defi-aggregation-flow.md)
- [Smart wallet contract guide](../contracts/smart-wallet-contract.md)
- [Contract deployment guide](../contracts/deployment.md)
