import { rpc as SorobanRpc } from '@stellar/stellar-sdk';

const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');

async function printLatestLedger(): Promise<void> {
  const latestLedger = await server.getLatestLedger();
  console.log(`Latest Soroban ledger: ${latestLedger.sequence}`);
}

printLatestLedger().catch((error) => {
  console.error('Failed to load latest Soroban ledger:', error);
  process.exit(1);
});

