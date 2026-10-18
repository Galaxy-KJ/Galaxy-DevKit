import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { SponsoredReservesManager } from '../services/sponsored-reserves-manager.js';

jest.setTimeout(120000);

const testnetDescribe = process.env.RUN_STELLAR_TESTNET_INTEGRATION === 'true'
  ? describe
  : describe.skip;

async function fundTestnetAccount(publicKey: string): Promise<void> {
  const response = await fetch(
    `https://friendbot-testnet.stellar.org?addr=${publicKey}`
  );
  if (!response.ok) {
    throw new Error(`Friendbot funding failed: ${response.status} ${response.statusText}`);
  }
}

testnetDescribe('Sponsored reserves testnet integration', () => {
  it('lists sponsored account, trustline, and data entries', async () => {
    const sponsor = Keypair.random();
    const sponsored = Keypair.random();
    const issuer = Keypair.random();
    const horizonUrl = 'https://horizon-testnet.stellar.org';
    const horizon = new Horizon.Server(horizonUrl);

    await Promise.all([
      fundTestnetAccount(sponsor.publicKey()),
      fundTestnetAccount(issuer.publicKey()),
    ]);

    let sponsorAccount = await horizon.loadAccount(sponsor.publicKey());
    const createAccountTransaction = new TransactionBuilder(sponsorAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.beginSponsoringFutureReserves({
        sponsoredId: sponsored.publicKey(),
      }))
      .addOperation(Operation.createAccount({
        destination: sponsored.publicKey(),
        startingBalance: '0',
      }))
      .addOperation(Operation.endSponsoringFutureReserves({
        source: sponsored.publicKey(),
      }))
      .setTimeout(30)
      .build();
    createAccountTransaction.sign(sponsor, sponsored);
    await horizon.submitTransaction(createAccountTransaction);

    sponsorAccount = await horizon.loadAccount(sponsor.publicKey());
    const entriesTransaction = new TransactionBuilder(sponsorAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.beginSponsoringFutureReserves({
        sponsoredId: sponsored.publicKey(),
      }))
      .addOperation(Operation.changeTrust({
        asset: new Asset('SPONSORED', issuer.publicKey()),
        source: sponsored.publicKey(),
      }))
      .addOperation(Operation.manageData({
        name: 'sponsorship-test',
        value: 'true',
        source: sponsored.publicKey(),
      }))
      .addOperation(Operation.endSponsoringFutureReserves({
        source: sponsored.publicKey(),
      }))
      .setTimeout(30)
      .build();
    entriesTransaction.sign(sponsor, sponsored);
    await horizon.submitTransaction(entriesTransaction);

    const manager = new SponsoredReservesManager({
      network: 'testnet',
      horizonUrl,
      rpcUrl: 'https://soroban-testnet.stellar.org',
      passphrase: Networks.TESTNET,
    });
    const entries = await manager.getEntriesSponsoredBy(sponsor.publicKey());
    const sponsoredEntries = entries.filter(
      (entry) => entry.sponsoredAccount === sponsored.publicKey()
    );

    expect(sponsoredEntries.map((entry) => entry.entryType)).toEqual(
      expect.arrayContaining(['account', 'trustline', 'data'])
    );
  });
});