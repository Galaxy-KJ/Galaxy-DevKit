# Smart Wallet Flow

This document focuses on the Smart Wallet authorization path used by `SmartWalletService`.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Backend as CredentialBackend
    participant SW as SmartWalletService
    participant RPC as Soroban RPC
    participant Sponsor as Sponsor Service

    User->>App: initiate wallet action
    App->>SW: build/sign request
    SW->>RPC: simulate transaction
    RPC-->>SW: auth entry + simulation result

    alt Passkey admin flow
        SW->>Backend: get(WebAuthn request)
        Backend-->>SW: PublicKeyCredential assertion
        SW->>SW: encode AccountSignature::WebAuthn(...)
    else Session key flow
        App->>SW: signWithSessionKey(..., signFn)
        SW->>SW: hash auth entry
        SW->>App: auth-entry hash via signFn
        App-->>SW: 64-byte Ed25519 signature
        SW->>SW: encode AccountSignature::SessionKey(...)
    end

    SW->>SW: attach signature to auth entry
    SW->>RPC: assemble transaction
    RPC-->>SW: fee-less signed XDR
    SW-->>App: signed XDR
    App->>Sponsor: submit signed XDR
    Sponsor->>RPC: fee-bump / submit
    RPC-->>Sponsor: transaction hash + result
    Sponsor-->>App: submission result
```

## Why The Flow Returns XDR

`SmartWalletService` intentionally stops at signed XDR:
- credentials stay client-side,
- fee sponsorship stays server-side,
- transaction policy can be enforced by the sponsor before submission.

## Credential Backends

The credential backend abstraction exists so this flow works outside the browser:
- Browser: wrap `navigator.credentials`
- Tests: inject prebuilt assertion credentials
- React Native: wrap a passkey/mobile biometric package
- Server/HSM: wrap a custom signing service

## Related Docs

- [Smart Wallet API Reference](../smart-wallet/api-reference.md)
- [Smart Wallet Integration Guide](../smart-wallet/integration-guide.md)
