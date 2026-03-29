# DeFi Aggregation Flow

This document shows how quote selection, wallet authorization, and submission fit together for DeFi operations.

## Routing Diagram

```mermaid
flowchart LR
    Request["Swap / route request"] --> Router["Aggregator or protocol router"]
    Router --> Soroswap["Soroswap adapter"]
    Router --> Blend["Blend / lending adapter"]
    Router --> Other["Future protocol adapters"]
    Soroswap --> Best["Best route result"]
    Blend --> Best
    Other --> Best
    Best --> Wallet["Smart wallet signing path"]
    Wallet --> Sponsor["Fee sponsor"]
    Sponsor --> Stellar["Stellar network"]
```

## End-to-End Sequence

```mermaid
sequenceDiagram
    participant Client as Client app
    participant Router as DeFi router
    participant Wallet as SmartWalletService / SessionKeyManager
    participant Sponsor as Fee sponsor
    participant Stellar as Stellar network

    Client->>Router: Request quote and route
    Router-->>Client: Best protocol path and call parameters
    Client->>Wallet: Build and sign Soroban tx
    Wallet-->>Client: Fee-less signed XDR
    Client->>Sponsor: Send XDR for sponsorship
    Sponsor->>Stellar: Submit final transaction
    Stellar-->>Client: Result and events
```

## Why Session Keys Matter Here

- High-frequency flows should avoid a biometric prompt on every swap.
- Session keys let bots or automations sign repeated transactions within a bounded TTL.
- Revocation and expiry keep those delegated rights time-limited.
