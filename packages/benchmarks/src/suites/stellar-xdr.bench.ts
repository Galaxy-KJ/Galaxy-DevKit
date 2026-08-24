import { Bench } from 'tinybench';
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

/**
 * Transaction build + XDR encode with no Horizon. Mirrors the builder
 * path used by StellarService.sendPayment after loadAccount returns.
 */
export async function stellarXdrBench(): Promise<Bench> {
  const source = Keypair.random();
  const dest = Keypair.random();
  const account = new Account(source.publicKey(), '1');

  const bench = new Bench({ time: 300, warmupTime: 50 });

  bench.add('tx build + toXDR', () => {
    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: dest.publicKey(),
          asset: Asset.native(),
          amount: '1',
        })
      )
      .setTimeout(30)
      .build();
    tx.sign(source);
    tx.toXDR();
  });

  return bench;
}
