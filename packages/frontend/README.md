# @galaxy-kj/frontend

Vite + TypeScript playground for testing Galaxy DevKit smart wallets, Stellar SDK imports, and Soroban signing flows in a browser.

## Development

```bash
npm run dev --workspace=@galaxy-kj/frontend
```

The dev server runs on `http://localhost:5173`.

## Build

```bash
npm run build --workspace=@galaxy-kj/frontend
```

The Vite config resolves monorepo packages directly from source so browser builds can consume `@galaxy-kj/core-stellar-sdk` during local development.

## Components

### WalletCreatePanel
Handles the WebAuthn passkey registration and smart wallet factory deployment.

### WalletSignersPanel
Handles adding and removing admin signers on an existing smart wallet contract.

### WalletTxPanel
Builds, simulates, signs, and submits payment transactions while tracking each submission lifecycle.

### TxHistoryPanel
Renders persistent transaction history from local storage with status badges, Stellar Expert links, and failed-transaction re-simulation.

## Services

### SmartWalletClient
A browser-ready wrapper around `SmartWalletService` that manages WebAuthn credential persistence in `localStorage`.

### TxTrackerService
Persistent local transaction store used by the transaction panel and history panel.

## Testing
Run tests with:
```bash
npm test --workspace=@galaxy-kj/frontend
npm run test:coverage --workspace=@galaxy-kj/frontend
```
Coverage is maintained at 90%+.

## Examples

- Register a browser passkey and deploy a smart wallet from the create panel.
- Prepare add-signer and remove-signer XDR from the signer management panel.
- Confirm the playground can import `@galaxy-kj/core-stellar-sdk` by checking the generated testnet public key on load.
- Submit transactions and verify they appear in the persistent history panel with status updates.
