# @galaxy-kj/frontend

Frontend components and services for the Galaxy DevKit playground.

## Components

### WalletCreatePanel
Handles the WebAuthn passkey registration and smart wallet factory deployment.

### WalletSignersPanel
Handles adding and removing admin signers on an existing smart wallet contract.

## Services

### SmartWalletClient
A browser-ready wrapper around `SmartWalletService` that manages WebAuthn credential persistence in `localStorage`.

## Testing
Run tests with:
```bash
npm test
```
Coverage is maintained at 90%+.
