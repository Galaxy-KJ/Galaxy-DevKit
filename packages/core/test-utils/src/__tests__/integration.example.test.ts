import { getWorkerAccount, server, submitTransaction, getXLMBalance } from '../testnet-helpers.js';
import { TransactionBuilder, Operation, Asset, BASE_FEE, Networks } from '@stellar/stellar-sdk';

describe('Integration Test Example', () => {
  it('should have a funded worker account and be able to send a transaction', async () => {
    const workerAccount = await getWorkerAccount();
    const publicKey = workerAccount.publicKey();
    
    console.log(`Using worker account: ${publicKey}`);
    
    // Check balance
    const balance = await getXLMBalance(publicKey);
    expect(parseFloat(balance)).toBeGreaterThan(0);
    
    // Send a small payment to itself to verify transaction submission
    const account = await server.loadAccount(publicKey);
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: publicKey,
          asset: Asset.native(),
          amount: '0.00001',
        })
      )
      .setTimeout(30)
      .build();
    
    const result = await submitTransaction(transaction, workerAccount);
    expect(result.successful).toBe(true);
  }, 60000);
});
