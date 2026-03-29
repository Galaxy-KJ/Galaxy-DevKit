# Smart Wallet Auth Flow

This document covers the passkey-to-Soroban authorization path used by the smart wallet contracts and `SmartWalletService`.

## Flow Diagram

```mermaid
sequenceDiagram
    participant User as User
    participant Browser as Browser / WebAuthn
    participant Service as SmartWalletService
    participant Wallet as Wallet contract
    participant Sponsor as Fee sponsor
    participant Stellar as Stellar network

    User->>Browser: Approve passkey prompt
    Service->>Wallet: Build Soroban invocation
    Service->>Stellar: Simulate transaction
    Stellar-->>Service: Auth entry with nonce and expiration
    Service->>Browser: Use auth entry hash as WebAuthn challenge
    Browser-->>Service: Assertion
    Service->>Service: Convert DER signature to compact P-256
    Service->>Service: Attach AccountSignature::WebAuthn to auth entry
    Service-->>Sponsor: Return fee-less signed XDR
    Sponsor->>Stellar: Submit sponsored transaction
    Stellar->>Wallet: Execute require_auth -> __check_auth
```

## Responsibilities

- `WebAuthNProvider` owns the browser credential ceremony.
- `SmartWalletService` builds the Soroban transaction, simulates it, hashes the auth entry, and binds the WebAuthn assertion to that exact payload.
- The wallet contract verifies the challenge and the P-256 signature in `__check_auth`.

## Key Properties

- The challenge is derived from the simulated auth entry, not a random detached nonce.
- The returned XDR is fee-less so a sponsor can add fees separately.
- Admin passkeys authenticate contract management calls such as deploy, add signer, and remove signer.
