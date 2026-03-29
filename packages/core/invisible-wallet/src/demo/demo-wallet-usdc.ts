// @ts-nocheck

/**
 * @fileoverview Demo: Create an Invisible Wallet with XLM + USDC
 * @description
 *   This script demonstrates the full flow of creating an invisible wallet
 *   that immediately has both XLM and USDC available.
 *
 *   Flow:
 *   1. Create invisible wallet (generates Stellar keypair)
 *   2. Fund with testnet XLM via Friendbot
 *   3. Add USDC trustline
 *   4. Swap some XLM → USDC
 *   5. Display final balances (XLM + USDC)
 *
 *   Run: npx ts-node --esm src/demo/demo-wallet-usdc.ts
 *
 * @author Galaxy DevKit Team
 */

import { Keypair, Horizon, Networks, TransactionBuilder, Operation, Asset } from '@stellar/stellar-sdk';

// ─── Config ────────────────────────────────────────────────────────────
const TESTNET_HORIZON = 'https://horizon-testnet.stellar.org';
const TESTNET_PASSPHRASE = Networks.TESTNET;
const FRIENDBOT_URL = 'https://friendbot.stellar.org';

// USDC issuer on testnet (Circle's testnet anchor)
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC_CODE = 'USDC';

// ─── Helpers ───────────────────────────────────────────────────────────

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const url = `${FRIENDBOT_URL}?addr=${publicKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Friendbot failed: ${text}`);
  }
  console.log(`  ✓ Funded via Friendbot`);
}

async function getBalances(server: Horizon.Server, publicKey: string): Promise<void> {
  const account = await server.loadAccount(publicKey);
  console.log('\n  ┌─────────────────────────────────────────────┐');
  console.log('  │            WALLET BALANCES                  │');
  console.log('  ├─────────────────────────────────────────────┤');
  for (const balance of account.balances) {
    if (balance.asset_type === 'native') {
      console.log(`  │  XLM:   ${parseFloat(balance.balance).toFixed(4).padStart(18)} │`);
    } else if ('asset_code' in balance) {
      console.log(`  │  ${balance.asset_code}:  ${parseFloat(balance.balance).toFixed(4).padStart(18)} │`);
    }
  }
  console.log('  └─────────────────────────────────────────────┘');
}

// ─── Main Demo ─────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Galaxy DevKit - Invisible Wallet Demo (XLM + USDC)    ║');
  console.log('║   Network: Stellar Testnet                              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log();

  const server = new Horizon.Server(TESTNET_HORIZON);

  // ── Step 1: Create wallet keypair ──────────────────────────────────
  console.log('1. Creating Invisible Wallet...');
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();
  console.log(`  ✓ Public Key:  ${publicKey}`);
  console.log(`  ✓ Secret Key:  ${secretKey.substring(0, 4)}...${secretKey.substring(secretKey.length - 4)} (hidden)`);
  console.log();

  // ── Step 2: Fund with XLM via Friendbot ────────────────────────────
  console.log('2. Funding wallet with testnet XLM...');
  await fundWithFriendbot(publicKey);
  console.log();

  // ── Step 3: Add USDC Trustline ─────────────────────────────────────
  console.log('3. Adding USDC trustline...');
  const account = await server.loadAccount(publicKey);
  const usdcAsset = new Asset(USDC_CODE, USDC_ISSUER);

  const trustlineTx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset: usdcAsset,
      })
    )
    .setTimeout(180)
    .build();

  trustlineTx.sign(keypair);
  const trustlineResult = await server.submitTransaction(trustlineTx);
  console.log(`  ✓ Trustline added - Hash: ${trustlineResult.hash.substring(0, 16)}...`);
  console.log();

  // ── Step 4: Swap XLM → USDC via path payment ──────────────────────
  console.log('4. Swapping 10 XLM → USDC...');
  const swapAmount = '10';

  // Find paths first
  const paths = await server
    .strictSendPaths(Asset.native(), swapAmount, [usdcAsset])
    .call();

  if (paths.records.length === 0) {
    console.log('  ⚠ No swap path found on testnet (USDC liquidity may not be available).');
    console.log('  → Wallet created with XLM only. USDC trustline is active.');
    console.log('  → On mainnet, the swap would execute automatically.');
  } else {
    const bestPath = paths.records[0];
    const destMin = (parseFloat(bestPath.destination_amount) * 0.99).toFixed(7);
    console.log(`  → Best path: ${swapAmount} XLM → ~${bestPath.destination_amount} USDC`);

    const accountForSwap = await server.loadAccount(publicKey);
    const swapTx = new TransactionBuilder(accountForSwap, {
      fee: '100',
      networkPassphrase: TESTNET_PASSPHRASE,
    })
      .addOperation(
        Operation.pathPaymentStrictSend({
          sendAsset: Asset.native(),
          sendAmount: swapAmount,
          destination: publicKey,
          destAsset: usdcAsset,
          destMin: destMin,
          path: bestPath.path.map((p: any) =>
            p.asset_type === 'native' ? Asset.native() : new Asset(p.asset_code, p.asset_issuer)
          ),
        })
      )
      .setTimeout(180)
      .build();

    swapTx.sign(keypair);
    const swapResult = await server.submitTransaction(swapTx);
    console.log(`  ✓ Swap executed - Hash: ${swapResult.hash.substring(0, 16)}...`);
  }
  console.log();

  // ── Step 5: Show final balances ────────────────────────────────────
  console.log('5. Final wallet state:');
  await getBalances(server, publicKey);

  console.log();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Wallet is ready! Has XLM + USDC trustline.');
  console.log('  Compatible with Trustless Work, Soroban dApps, etc.');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Demo failed:', err.message || err);
  process.exit(1);
});
