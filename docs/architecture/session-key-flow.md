# Session Key Flow

This document describes how short-lived Ed25519 session signers are created, used, revoked, and allowed to expire on-chain.

## Lifecycle Diagram

```mermaid
stateDiagram-v2
    [*] --> Created: createSession()
    Created --> Registered: add_session_signer
    Registered --> Active: session key signs txs
    Active --> Revoked: remove_signer
    Active --> Expired: Soroban temporary TTL reaches zero
    Revoked --> [*]
    Expired --> [*]
```

## Detailed Flow

```mermaid
sequenceDiagram
    participant User as User
    participant Manager as SessionKeyManager
    participant Browser as Browser / WebAuthn
    participant Service as SmartWalletService
    participant Wallet as Wallet contract

    Manager->>Manager: Generate fresh Ed25519 keypair
    Manager->>Manager: Derive session credential ID from session public key
    Manager->>Browser: Request one admin passkey assertion
    Manager->>Service: addSigner(wallet, sessionPublicKey, ttl, assertion)
    Service->>Wallet: add_session_signer(sessionCredentialId, sessionPublicKey, ttlLedgers)
    Wallet-->>Service: Simulated auth entry
    Service-->>Manager: Signed XDR for sponsor
    Manager->>Service: signWithSessionKey(...) for later txs
    Service->>Wallet: __check_auth(AccountSignature::SessionKey)
```

## Storage Model

- Admin signers live in persistent storage.
- Session signers live in Soroban temporary storage.
- Temporary storage TTL is extended on successful use and disappears automatically at expiry.

## Revocation Notes

- `SessionKeyManager.revoke()` clears the in-memory private key before awaiting the network path.
- `SmartWalletService.removeSigner()` now builds the `remove_signer` invocation and signs it with the admin passkey.
- The session credential ID used for `add_session_signer`, `remove_signer`, and `signWithSessionKey` is the same base64 encoding of the raw 32-byte session public key.
