# Galaxy DevKit 5-Minute Quickstart

Use this path when you want the shortest route from a fresh checkout to a browser playground that imports the Galaxy SDK packages.

## Prerequisites

- Node.js 18 or newer
- npm 8 or newer
- A Stellar testnet account funded from the Stellar Laboratory friendbot
- A modern browser with WebAuthn support for passkey flows

## Install And Build

```bash
git clone https://github.com/Galaxy-KJ/Galaxy-DevKit.git
cd Galaxy-DevKit
npm install
npm run build
```

Expected output:

```text
lerna success run Ran npm script 'build'
```

## Start The Playground

```bash
npm run dev --workspace=@galaxy-kj/frontend
```

Open `http://localhost:5173`. The page should show:

- The active Stellar testnet passphrase.
- A generated testnet account public key.
- Smart wallet panels for passkey registration, wallet deployment, and signer management.

## Create A Testnet Account

Use the Stellar Laboratory friendbot:

```bash
curl "https://friendbot.stellar.org?addr=G_YOUR_TESTNET_PUBLIC_KEY"
```

Expected output includes a transaction hash and `successful: true`.

## Next Steps

- Follow the complete wallet-to-transaction flow in [Getting Started](./getting-started.md).
- Read the smart wallet API details in [Smart Wallet API Reference](./smart-wallet/api-reference.md).
- Use the browser playground package in [Frontend Playground](../packages/frontend/README.md).
