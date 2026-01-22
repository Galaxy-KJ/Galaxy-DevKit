/**
 * @fileoverview Deploy Soroban contract example
 * @description Example of deploying a Soroban smart contract
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  SorobanContractManager,
  ScValConverter,
  ContractFactory,
} from '@galaxy/core-stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';
import * as fs from 'fs';
import * as path from 'path';

async function deployContractExample() {
  console.log('🚀 Deploying Soroban Contract Example');
  console.log('=====================================');

  // Initialize contract manager
  const manager = new SorobanContractManager(
    'https://soroban-testnet.stellar.org'
  );

  // Load contract WASM (replace with your actual contract)
  const contractWasm = fs.readFileSync(
    path.join(__dirname, '../contracts/example_contract.wasm')
  );

  // Generate deployer keypair (in production, use existing keypair)
  const deployer = Keypair.random();
  console.log(`🔐 Deployer Public Key: ${deployer.publicKey()}`);
  console.log(`🔑 Deployer Secret Key: ${deployer.secret()}`);
  console.log('⚠️  Fund this account with testnet lumens before proceeding');

  try {
    // Method 1: Direct deployment using SorobanContractManager
    console.log('\n📦 Method 1: Direct Deployment');
    console.log('-------------------------------');

    const deploymentResult = await manager.deployContract({
      wasm: contractWasm,
      deployer: deployer,
      networkPassphrase: 'Test SDF Network ; September 2015',
    });

    console.log(`✅ Contract deployed successfully!`);
    console.log(`📍 Contract ID: ${deploymentResult.contractId}`);
    console.log(`🔗 Transaction Hash: ${deploymentResult.transactionHash}`);
    console.log(`📊 Ledger: ${deploymentResult.ledger}`);

    // Method 2: Using Contract Factory
    console.log('\n🏭 Method 2: Using Contract Factory');
    console.log('------------------------------------');

    const factory = new ContractFactory({
      wasm: contractWasm,
      networkPassphrase: 'Test SDF Network ; September 2015',
    });

    // Deploy with salt for deterministic address
    const salt = 'deterministic_salt_123';
    const predictedAddress = factory.getPredictedAddress(deployer, salt);
    console.log(`🎯 Predicted Contract Address: ${predictedAddress}`);

    const factoryDeploymentResult = await factory.deployWithSalt(
      deployer,
      salt
    );
    console.log(`✅ Factory deployment successful!`);
    console.log(`📍 Contract ID: ${factoryDeploymentResult.contractId}`);

    // Test the deployed contract
    console.log('\n🧪 Testing Deployed Contract');
    console.log('-----------------------------');

    const contractId = deploymentResult.contractId;

    // Simulate contract initialization
    const simulationResult = await manager.simulateInvocation({
      contractId,
      method: 'initialize',
      args: [42, 'hello'],
      networkPassphrase: 'Test SDF Network ; September 2015',
    });

    console.log(`🔍 Simulation Success: ${!simulationResult.error}`);
    console.log(
      `💰 Estimated CPU Instructions: ${simulationResult.cpuInstructions}`
    );
    console.log(`🧠 Estimated Memory Bytes: ${simulationResult.memoryBytes}`);
    console.log(
      `💵 Min Resource Fee: ${simulationResult.minResourceFee} stroops`
    );

    // Actually initialize the contract
    const initResult = await manager.invokeContract({
      contractId,
      method: 'initialize',
      args: [42, 'hello'],
      caller: deployer,
      networkPassphrase: 'Test SDF Network ; September 2015',
    });

    console.log(`✅ Contract initialized successfully!`);
    console.log(`🔗 Transaction Hash: ${initResult.transactionHash}`);
    console.log(`📊 Ledger: ${initResult.ledger}`);
    console.log(`🎯 Result: ${ScValConverter.fromScVal(initResult.result)}`);

    // Read contract state
    console.log('\n📖 Reading Contract State');
    console.log('---------------------------');

    const state = await manager.readContractState({
      contractId,
      key: 'counter',
      networkPassphrase: 'Test SDF Network ; September 2015',
    });

    console.log(`📊 Contract State: ${state}`);

    console.log('\n🎉 Deployment example completed successfully!');
    console.log(`📍 Contract ID: ${contractId}`);
    console.log(
      `🔗 Transaction Explorer: https://stellar.expert/explorer/testnet/tx/${deploymentResult.transactionHash}`
    );
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);

    if (error.message.includes('insufficient balance')) {
      console.log(
        '💡 Tip: Ensure your deployer account has sufficient lumens for deployment'
      );
    }

    if (error.message.includes('Simulation failed')) {
      console.log('💡 Tip: Check your contract initialization parameters');
    }
  }
}

// Additional helper functions
async function checkAccountBalance(publicKey: string): Promise<void> {
  const manager = new SorobanContractManager();

  try {
    const account = await manager.getServer().getAccount(publicKey);
    console.log(`💰 Account Balance: ${account.balance} XLM`);
  } catch (error) {
    console.log('❌ Account not found or not funded');
  }
}

async function getContractInfo(contractId: string): Promise<void> {
  const manager = new SorobanContractManager();

  try {
    const info = await manager.readContractState({
      contractId,
      key: 'info',
      networkPassphrase: 'Test SDF Network ; September 2015',
    });

    console.log(`📋 Contract Info:`, info);
  } catch (error) {
    console.log('❌ Failed to read contract info:', error.message);
  }
}

// Run the example
if (require.main === module) {
  deployContractExample()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Example failed:', error);
      process.exit(1);
    });
}

export { deployContractExample, checkAccountBalance, getContractInfo };
