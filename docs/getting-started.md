# Getting Started: Wallet Creation To First Transaction

This guide walks through the first Galaxy DevKit smart wallet flow on Stellar testnet: install dependencies, configure providers, deploy a wallet, prepare a USDC trustline, create a session signer, submit a transaction, and revoke the session.

## Prerequisites

- Node.js 18 or newer and npm 8 or newer.
- A browser that supports WebAuthn passkeys.
- A Stellar testnet account funded with XLM.
- A deployed smart-wallet factory contract. The current default factory is built into `SmartWalletService`, but production apps should pass an explicit factory contract ID.
- A sponsor service or backend capable of submitting signed Soroban XDR to testnet.

Create and fund a testnet account:

```ts
import { Keypair } from '@stellar/stellar-sdk';

const source = Keypair.random();
console.log(source.publicKey());
console.log(source.secret());
```

Then fund it:

```bash
curl "https://friendbot.stellar.org?addr=G_YOUR_TESTNET_PUBLIC_KEY"
```

Expected output contains `successful: true`.

## 1. Install Packages

```bash
npm install @galaxy-kj/core-wallet @galaxy-kj/core-stellar-sdk @stellar/stellar-sdk
```

For monorepo development:

```bash
npm install
npm run build
```

## 2. Configure Providers

Use WebAuthn in the browser. Use a custom credential backend in tests, Node.js, or React Native.

```ts
import { Networks } from '@stellar/stellar-sdk';
import { SmartWalletService } from '@galaxy-kj/core-wallet';
import { SessionKeyManager } from '@galaxy-kj/core-wallet/auth/session/SessionKeyManager';

const webAuthnProvider = {
  rpId: window.location.hostname,
  relyingPartyId: window.location.hostname,
};

const smartWallet = new SmartWalletService(
  webAuthnProvider,
  'https://soroban-testnet.stellar.org',
  'C_FACTORY_CONTRACT_ID',
  Networks.TESTNET
);

const sessionKeyManager = new SessionKeyManager(webAuthnProvider, smartWallet);
```

Expected result: `smartWallet` is ready to simulate Soroban auth and produce signed XDR for a sponsor.

## 3. Register A Passkey

```ts
const challenge = crypto.getRandomValues(new Uint8Array(32));
const userId = crypto.getRandomValues(new Uint8Array(16));

const credential = await navigator.credentials.create({
  publicKey: {
    challenge,
    rp: { name: 'Galaxy DevKit', id: window.location.hostname },
    user: {
      id: userId,
      name: 'demo@example.com',
      displayName: 'Demo User',
    },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'required',
    },
    timeout: 60000,
  },
}) as PublicKeyCredential;

const response = credential.response as AuthenticatorAttestationResponse;
const publicKey65Bytes = response.getPublicKey();

if (!publicKey65Bytes) {
  throw new Error('Passkey registration did not return a public key');
}
```

Expected output:

- `credential.id`: a base64url passkey credential ID.
- `publicKey65Bytes`: a 65-byte uncompressed SEC-1 public key.

## 4. Deploy A Smart Wallet

```ts
const walletAddress = await smartWallet.deploy(new Uint8Array(publicKey65Bytes));
console.log(walletAddress);
```

Expected output is a Soroban contract address beginning with `C`.

If deployment returns signed XDR in your environment, submit it through your sponsor endpoint:

```ts
await fetch('/api/submit-soroban-xdr', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ signedTxXdr }),
});
```

## 5. Set Up A USDC Trustline

USDC on Stellar testnet uses issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.

```ts
import { Asset, BASE_FEE, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

const usdc = new Asset(
  'USDC',
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
);

const tx = new TransactionBuilder(sourceAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.changeTrust({ asset: usdc }))
  .setTimeout(300)
  .build();
```

Expected output is a signed transaction envelope ready for testnet submission.

## 6. Create A Session Key

Session signers reduce repeated biometric prompts. Use one passkey prompt to authorize a short-lived signer.

```ts
const session = await sessionKeyManager.createSession({
  smartWalletAddress: walletAddress,
  passkeyCredentialId: credential.id,
  ttlSeconds: 3600,
});

console.log(session.publicKey);
console.log(session.expiresAt);
```

Expected output includes the session signer public key and its Unix expiry. Internally, the manager registers the signer on-chain through `SmartWalletService.addSigner()`.

## 7. Sign And Submit A Transaction

Build the Soroban transaction for your target contract, sign with the active session signer, then submit through the sponsor.

```ts
const signedTxXdr = await sessionKeyManager.signTransaction(
  sorobanTx,
  walletAddress
);

const result = await fetch('/api/submit-soroban-xdr', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ signedTxXdr }),
}).then(response => response.json());

console.log(result.transactionHash);
```

Expected output is a testnet transaction hash.

## 8. Revoke The Session

```ts
await sessionKeyManager.revoke(walletAddress, credential.id);
```

Expected output is no thrown error. The manager clears the in-memory private key before removing the signer on-chain.

## Troubleshooting

### Passkey registration returns null

Use HTTPS or `localhost`, confirm the browser supports WebAuthn, and set `relyingPartyId` to the current hostname.

### Factory deployment simulation fails

Confirm the factory contract ID is deployed on the same network as `rpcUrl` and `networkPassphrase`.

### No auth entries in simulation

The transaction may not require wallet authorization or may be invoking the wrong contract method. Rebuild the Soroban invocation and simulate again.

### Invalid session-key signature

`signWithSessionKey()` expects a 64-byte Ed25519 signature over the auth payload. Return the raw signature bytes from `Keypair.sign(payload)`.

### USDC trustline fails

Verify the issuer is the testnet issuer, the source account has enough XLM for reserves, and the transaction uses `Networks.TESTNET`.

## Detailed References

- [Smart Wallet Integration Guide](./smart-wallet/integration-guide.md)
- [Smart Wallet API Reference](./smart-wallet/api-reference.md)
- [Session Key Lifecycle](./smart-wallet/session-keys.md)
- [Smart Wallet Auth Flow](./architecture/smart-wallet-auth-flow.md)
- [Contract Deployment Guide](./contracts/deployment.md)
