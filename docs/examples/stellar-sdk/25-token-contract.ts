/**
 * @fileoverview Token contract example
 * @description Example of interacting with Soroban token contracts
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  TokenContractWrapper,
  ContractEventMonitor,
  ScValConverter,
} from '@galaxy/core-stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';

async function tokenContractExample() {
  console.log('🪙 Token Contract Interaction Example');
  console.log('=====================================');

  // Configuration
  const tokenContractId = 'YOUR_TOKEN_CONTRACT_ID_HERE'; // Replace with actual token contract ID
  const networkPassphrase = 'Test SDF Network ; September 2015';
  const eventMonitor = new ContractEventMonitor(
    'https://soroban-testnet.stellar.org'
  );

  // Create token contract wrapper
  const tokenWrapper = new TokenContractWrapper(
    tokenContractId,
    networkPassphrase,
    'https://soroban-testnet.stellar.org'
  );

  // Create keypairs for demonstration
  const admin = Keypair.random();
  const alice = Keypair.random();
  const bob = Keypair.random();
  const charlie = Keypair.random();

  console.log('🔐 Generated KeyPairs:');
  console.log(`   Admin: ${admin.publicKey()}`);
  console.log(`   Alice: ${alice.publicKey()}`);
  console.log(`   Bob: ${bob.publicKey()}`);
  console.log(`   Charlie: ${charlie.publicKey()}`);
  console.log('⚠️  Fund these accounts with testnet lumens before proceeding');

  try {
    // Example 1: Get token information
    console.log('\n📋 Example 1: Token Information');
    console.log('---------------------------------');

    const tokenInfo = await tokenWrapper.getInfo();
    console.log(`🏷️  Token Name: ${tokenInfo.name}`);
    console.log(`🔤 Symbol: ${tokenInfo.symbol}`);
    console.log(`🔢 Decimals: ${tokenInfo.decimals}`);
    console.log(
      `💰 Total Supply: ${tokenWrapper.formatAmount(tokenInfo.totalSupply)}`
    );
    console.log(`👤 Admin: ${tokenInfo.admin}`);

    // Get individual token properties
    const name = await tokenWrapper.getName();
    const symbol = await tokenWrapper.getSymbol();
    const decimals = await tokenWrapper.getDecimals();
    const totalSupply = await tokenWrapper.getTotalSupply();
    const adminAddress = await tokenWrapper.getAdmin();

    console.log('\n🔍 Individual Properties:');
    console.log(`   Name: ${name}`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Decimals: ${decimals}`);
    console.log(`   Total Supply: ${totalSupply}`);
    console.log(`   Admin: ${adminAddress}`);

    // Example 2: Check balances
    console.log('\n💰 Example 2: Checking Balances');
    console.log('--------------------------------');

    const accounts = [
      { name: 'Admin', keypair: admin },
      { name: 'Alice', keypair: alice },
      { name: 'Bob', keypair: bob },
      { name: 'Charlie', keypair: charlie },
    ];

    for (const account of accounts) {
      const balance = await tokenWrapper.getBalance(
        account.keypair.publicKey()
      );
      const formattedBalance = tokenWrapper.formatAmount(balance, decimals);
      console.log(`💳 ${account.name} Balance: ${formattedBalance} ${symbol}`);
    }

    // Example 3: Mint tokens (admin only)
    console.log('\n🏭 Example 3: Minting Tokens');
    console.log('----------------------------');

    const mintAmount = tokenWrapper.parseAmount('1000', decimals);
    console.log(
      `🪙 Minting ${tokenWrapper.formatAmount(mintAmount, decimals)} tokens to Alice...`
    );

    try {
      const mintResult = await tokenWrapper.mint(
        admin,
        alice.publicKey(),
        mintAmount
      );
      console.log(`✅ Mint successful!`);
      console.log(`🔗 Transaction Hash: ${mintResult.transactionHash}`);
      console.log(`📊 Ledger: ${mintResult.ledger}`);

      // Check Alice's new balance
      const aliceBalance = await tokenWrapper.getBalance(alice.publicKey());
      console.log(
        `💳 Alice's New Balance: ${tokenWrapper.formatAmount(aliceBalance, decimals)} ${symbol}`
      );
    } catch (error) {
      console.log(`❌ Mint failed: ${error.message}`);
      console.log(
        '💡 Tip: Ensure admin account has proper permissions and sufficient lumens'
      );
    }

    // Example 4: Transfer tokens
    console.log('\n💸 Example 4: Transferring Tokens');
    console.log('----------------------------------');

    const transferAmount = tokenWrapper.parseAmount('100', decimals);
    console.log(
      `💸 Transferring ${tokenWrapper.formatAmount(transferAmount, decimals)} tokens from Alice to Bob...`
    );

    try {
      const transferResult = await tokenWrapper.transfer(
        alice,
        bob.publicKey(),
        transferAmount
      );
      console.log(`✅ Transfer successful!`);
      console.log(`🔗 Transaction Hash: ${transferResult.transactionHash}`);
      console.log(`📊 Ledger: ${transferResult.ledger}`);

      // Check updated balances
      const aliceNewBalance = await tokenWrapper.getBalance(alice.publicKey());
      const bobBalance = await tokenWrapper.getBalance(bob.publicKey());

      console.log(
        `💳 Alice's New Balance: ${tokenWrapper.formatAmount(aliceNewBalance, decimals)} ${symbol}`
      );
      console.log(
        `💳 Bob's Balance: ${tokenWrapper.formatAmount(bobBalance, decimals)} ${symbol}`
      );
    } catch (error) {
      console.log(`❌ Transfer failed: ${error.message}`);
      console.log(
        '💡 Tip: Ensure Alice has sufficient tokens and lumens for fees'
      );
    }

    // Example 5: Approve and transferFrom
    console.log('\n📝 Example 5: Approval and Transfer From');
    console.log('-------------------------------------------');

    const approveAmount = tokenWrapper.parseAmount('50', decimals);
    const transferFromAmount = tokenWrapper.parseAmount('25', decimals);

    console.log(
      `📝 Alice approving Charlie to spend ${tokenWrapper.formatAmount(approveAmount, decimals)} tokens...`
    );

    try {
      // Approve Charlie
      const approveResult = await tokenWrapper.approve(
        alice,
        charlie.publicKey(),
        approveAmount
      );
      console.log(`✅ Approval successful!`);
      console.log(`🔗 Transaction Hash: ${approveResult.transactionHash}`);

      // Check allowance
      const allowance = await tokenWrapper.getAllowance(
        alice.publicKey(),
        charlie.publicKey()
      );
      console.log(
        `💳 Charlie's Allowance: ${tokenWrapper.formatAmount(allowance, decimals)} ${symbol}`
      );

      // Transfer from Alice to Bob using Charlie's approval
      console.log(
        `💸 Charlie transferring ${tokenWrapper.formatAmount(transferFromAmount, decimals)} from Alice to Bob...`
      );

      const transferFromResult = await tokenWrapper.transferFrom(
        charlie,
        alice.publicKey(),
        bob.publicKey(),
        transferFromAmount
      );
      console.log(`✅ TransferFrom successful!`);
      console.log(`🔗 Transaction Hash: ${transferFromResult.transactionHash}`);

      // Check final balances
      const aliceFinalBalance = await tokenWrapper.getBalance(
        alice.publicKey()
      );
      const bobFinalBalance = await tokenWrapper.getBalance(bob.publicKey());
      const finalAllowance = await tokenWrapper.getAllowance(
        alice.publicKey(),
        charlie.publicKey()
      );

      console.log(
        `💳 Alice's Final Balance: ${tokenWrapper.formatAmount(aliceFinalBalance, decimals)} ${symbol}`
      );
      console.log(
        `💳 Bob's Final Balance: ${tokenWrapper.formatAmount(bobFinalBalance, decimals)} ${symbol}`
      );
      console.log(
        `💳 Charlie's Remaining Allowance: ${tokenWrapper.formatAmount(finalAllowance, decimals)} ${symbol}`
      );
    } catch (error) {
      console.log(`❌ Approval/TransferFrom failed: ${error.message}`);
    }

    // Example 6: Burn tokens
    console.log('\n🔥 Example 6: Burning Tokens');
    console.log('------------------------------');

    const burnAmount = tokenWrapper.parseAmount('10', decimals);
    console.log(
      `🔥 Bob burning ${tokenWrapper.formatAmount(burnAmount, decimals)} tokens...`
    );

    try {
      const burnResult = await tokenWrapper.burn(bob, burnAmount);
      console.log(`✅ Burn successful!`);
      console.log(`🔗 Transaction Hash: ${burnResult.transactionHash}`);

      const bobFinalBalance = await tokenWrapper.getBalance(bob.publicKey());
      console.log(
        `💳 Bob's Final Balance: ${tokenWrapper.formatAmount(bobFinalBalance, decimals)} ${symbol}`
      );
    } catch (error) {
      console.log(`❌ Burn failed: ${error.message}`);
    }

    // Example 7: Monitor token events
    console.log('\n📡 Example 7: Monitoring Token Events');
    console.log('-------------------------------------');

    let eventCount = 0;
    const subscriptionId = await eventMonitor.subscribeToEvents({
      contractId: tokenContractId,
      eventTypes: ['transfer', 'approval', 'mint', 'burn'],
      onEvent: event => {
        eventCount++;
        console.log(`🔔 Token Event #${eventCount}:`);

        // Try to decode specific token events
        const transfer =
          event.decodedTopics[0] === 'transfer'
            ? {
                from: event.decodedTopics[1],
                to: event.decodedTopics[2],
                amount: event.decodedTopics[3],
              }
            : null;

        const approval =
          event.decodedTopics[0] === 'approval'
            ? {
                owner: event.decodedTopics[1],
                spender: event.decodedTopics[2],
                amount: event.decodedTopics[3],
              }
            : null;

        if (transfer) {
          console.log(
            `   💸 Transfer: ${transfer.amount} tokens from ${transfer.from} to ${transfer.to}`
          );
        } else if (approval) {
          console.log(
            `   📝 Approval: ${approval.amount} tokens for ${approval.spender} by ${approval.owner}`
          );
        } else {
          console.log(`   📝 Event: ${event.decodedTopics[0]}`);
        }

        console.log(`   📅 Time: ${new Date(event.timestamp).toISOString()}`);
        console.log(`   📊 Ledger: ${event.ledger}`);
        console.log('');
      },
      onError: error => {
        console.error('❌ Event monitoring error:', error.message);
      },
    });

    console.log(`✅ Subscribed to token events with ID: ${subscriptionId}`);

    // Generate some more events to test monitoring
    console.log('\n🎯 Generating events for monitoring demo...');

    try {
      // Small transfer to generate event
      const demoAmount = tokenWrapper.parseAmount('1', decimals);
      await tokenWrapper.transfer(alice, bob.publicKey(), demoAmount);
      console.log('📤 Generated transfer event');
    } catch (error) {
      console.log(
        '⚠️  Could not generate event (expected in demo):',
        error.message
      );
    }

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Example 8: Amount formatting utilities
    console.log('\n🔢 Example 8: Amount Formatting Utilities');
    console.log('------------------------------------------');

    const testAmounts = [
      '0',
      '1',
      '10',
      '0.5',
      '0.001',
      '123.456789',
      '1000000000', // 1 token in smallest unit
    ];

    console.log(`💰 Amount Examples (${decimals} decimals):`);
    for (const amount of testAmounts) {
      const parsed = tokenWrapper.parseAmount(amount, decimals);
      const formatted = tokenWrapper.formatAmount(parsed, decimals);
      console.log(
        `   ${amount.padStart(12)} -> ${parsed.padStart(15)} -> ${formatted}`
      );
    }

    // Example 9: Token statistics
    console.log('\n📊 Example 9: Token Statistics');
    console.log('------------------------------');

    try {
      const finalBalances = [];
      const totalBalance = BigInt(0);

      for (const account of accounts) {
        const balance = await tokenWrapper.getBalance(
          account.keypair.publicKey()
        );
        finalBalances.push({ name: account.name, balance: BigInt(balance) });
      }

      const totalHeld = finalBalances.reduce(
        (sum, account) => sum + account.balance,
        BigInt(0)
      );
      const totalSupplyBig = BigInt(totalSupply);

      console.log('💰 Final Balances:');
      for (const account of finalBalances) {
        const formatted = tokenWrapper.formatAmount(
          account.balance.toString(),
          decimals
        );
        console.log(`   ${account.name}: ${formatted} ${symbol}`);
      }

      console.log(
        `💰 Total Held by Demo Accounts: ${tokenWrapper.formatAmount(totalHeld.toString(), decimals)} ${symbol}`
      );
      console.log(
        `💰 Token Total Supply: ${tokenWrapper.formatAmount(totalSupply, decimals)} ${symbol}`
      );

      const heldPercentage =
        Number((totalHeld * BigInt(10000)) / totalSupplyBig) / 100;
      console.log(
        `📊 Percentage of Supply Held: ${heldPercentage.toFixed(2)}%`
      );
    } catch (error) {
      console.log('⚠️  Could not calculate statistics:', error.message);
    }

    // Cleanup
    console.log('\n🧹 Cleaning up event monitoring...');
    eventMonitor.unsubscribe(subscriptionId);
    console.log('✅ Event monitoring stopped');

    console.log('\n🎉 Token contract example completed!');
    console.log(
      `🔗 Transaction Explorer: https://stellar.expert/explorer/testnet/account/${admin.publicKey()}`
    );
  } catch (error) {
    console.error('❌ Token contract example failed:', error.message);

    if (error.message.includes('insufficient balance')) {
      console.log(
        '💡 Tip: Ensure accounts have sufficient tokens for transfers'
      );
    }

    if (error.message.includes('insufficient fee')) {
      console.log(
        '💡 Tip: Ensure accounts have sufficient lumens for transaction fees'
      );
    }

    if (error.message.includes('unauthorized')) {
      console.log(
        '💡 Tip: Check if account has proper permissions for the operation'
      );
    }
  }
}

// Helper function to setup token distribution demo
async function setupTokenDistribution(
  tokenWrapper: TokenContractWrapper,
  admin: Keypair,
  recipients: Array<{ name: string; keypair: Keypair; amount: string }>,
  decimals: number
): Promise<void> {
  console.log('🎁 Setting up token distribution...');

  for (const recipient of recipients) {
    try {
      const amount = tokenWrapper.parseAmount(recipient.amount, decimals);
      const result = await tokenWrapper.mint(
        admin,
        recipient.keypair.publicKey(),
        amount
      );
      console.log(
        `✅ Minted ${recipient.amount} ${await tokenWrapper.getSymbol()} to ${recipient.name}`
      );
      console.log(`   🔗 Hash: ${result.transactionHash}`);
    } catch (error) {
      console.error(`❌ Failed to mint to ${recipient.name}:`, error.message);
    }
  }
}

// Helper function to create token faucet
async function createTokenFaucet(
  tokenWrapper: TokenContractWrapper,
  faucetAccount: Keypair,
  faucetAmount: string,
  decimals: number
): Promise<{ claim: (recipient: string) => Promise<any> }> {
  const amount = tokenWrapper.parseAmount(faucetAmount, decimals);

  return {
    claim: async (recipient: string) => {
      try {
        const result = await tokenWrapper.transfer(
          faucetAccount,
          recipient,
          amount
        );
        console.log(`💰 Faucet: Sent ${faucetAmount} tokens to ${recipient}`);
        return result;
      } catch (error) {
        console.error(
          `❌ Faucet failed to send to ${recipient}:`,
          error.message
        );
        throw error;
      }
    },
  };
}

// Run example
if (require.main === module) {
  tokenContractExample()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Example failed:', error);
      process.exit(1);
    });
}

export { tokenContractExample, setupTokenDistribution, createTokenFaucet };
