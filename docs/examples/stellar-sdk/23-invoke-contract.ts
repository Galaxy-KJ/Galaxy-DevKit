/**
 * @fileoverview Invoke Soroban contract example
 * @description Example of calling Soroban contract functions
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  SorobanContractManager,
  ScValConverter,
  FunctionSignatureBuilder,
} from '@galaxy/core-stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';

async function invokeContractExample() {
  console.log('🔧 Invoke Soroban Contract Example');
  console.log('==================================');

  // Configuration
  const contractId = 'YOUR_CONTRACT_ID_HERE'; // Replace with actual contract ID
  const networkPassphrase = 'Test SDF Network ; September 2015';
  const manager = new SorobanContractManager(
    'https://soroban-testnet.stellar.org'
  );

  // Create caller keypair (in production, use existing keypair)
  const caller = Keypair.random();
  console.log(`🔐 Caller Public Key: ${caller.publicKey()}`);
  console.log(`🔑 Caller Secret Key: ${caller.secret()}`);
  console.log('⚠️  Fund this account with testnet lumens before proceeding');

  try {
    // Example 1: Simple getter function
    console.log('\n📖 Example 1: Reading Contract State');
    console.log('--------------------------------------');

    const readResult = await manager.invokeContract({
      contractId,
      method: 'get_value',
      args: [],
      caller: caller,
      networkPassphrase,
      simulateOnly: true, // Simulation only for read operations
    });

    const value = ScValConverter.fromScVal(readResult.result);
    console.log(`📊 Contract Value: ${value}`);

    // Example 2: Function with multiple arguments
    console.log('\n✏️ Example 2: Updating Contract State');
    console.log('------------------------------------');

    // Build function signature for validation
    const signatureHash = FunctionSignatureBuilder.buildSignatureHash(
      'set_value',
      ['string', 'u64']
    );
    console.log(`🔐 Function Signature Hash: ${signatureHash}`);

    // Simulate before actual invocation
    console.log('🔍 Simulating transaction...');
    const simulationResult = await manager.simulateInvocation({
      contractId,
      method: 'set_value',
      args: ['example_key', 1000000],
      networkPassphrase,
    });

    if (simulationResult.error) {
      throw new Error(`Simulation failed: ${simulationResult.error}`);
    }

    console.log('✅ Simulation successful');
    console.log(`💰 CPU Instructions: ${simulationResult.cpuInstructions}`);
    console.log(`🧠 Memory Usage: ${simulationResult.memoryBytes} bytes`);
    console.log(`💵 Estimated Fee: ${simulationResult.minResourceFee} stroops`);

    // Execute the transaction
    console.log('📤 Executing transaction...');
    const setResult = await manager.invokeContract({
      contractId,
      method: 'set_value',
      args: ['example_key', 1000000],
      caller: caller,
      networkPassphrase,
    });

    console.log(`✅ Transaction executed!`);
    console.log(`🔗 Hash: ${setResult.transactionHash}`);
    console.log(`📊 Ledger: ${setResult.ledger}`);
    console.log(`🎯 Result: ${ScValConverter.fromScVal(setResult.result)}`);

    // Example 3: Complex data types
    console.log('\n🏗️ Example 3: Complex Data Types');
    console.log('---------------------------------');

    const complexData = {
      name: 'Complex Example',
      values: [1, 2, 3, 4, 5],
      metadata: {
        created: Date.now(),
        owner: caller.publicKey(),
        tags: ['example', 'demo', 'soroban'],
      },
    };

    console.log('🔍 Simulating complex data transaction...');
    const complexSimulation = await manager.simulateInvocation({
      contractId,
      method: 'set_complex_data',
      args: [complexData],
      networkPassphrase,
    });

    if (complexSimulation.error) {
      throw new Error(`Complex simulation failed: ${complexSimulation.error}`);
    }

    const complexResult = await manager.invokeContract({
      contractId,
      method: 'set_complex_data',
      args: [complexData],
      caller: caller,
      networkPassphrase,
    });

    console.log(`✅ Complex data transaction executed!`);
    console.log(`🔗 Hash: ${complexResult.transactionHash}`);

    // Example 4: Array operations
    console.log('\n📚 Example 4: Array Operations');
    console.log('--------------------------------');

    const arrayOperations = [
      { method: 'add_to_array', args: [[1, 2, 3]] },
      { method: 'get_array_length', args: [] },
      { method: 'get_array_item', args: [0] },
    ];

    for (const operation of arrayOperations) {
      console.log(`🔍 Simulating ${operation.method}...`);

      const arraySim = await manager.simulateInvocation({
        contractId,
        method: operation.method,
        args: operation.args,
        networkPassphrase,
      });

      if (arraySim.error) {
        console.log(
          `❌ ${operation.method} simulation failed: ${arraySim.error}`
        );
        continue;
      }

      const arrayResult = await manager.invokeContract({
        contractId,
        method: operation.method,
        args: operation.args,
        caller: caller,
        networkPassphrase,
      });

      const result = ScValConverter.fromScVal(arrayResult.result);
      console.log(`✅ ${operation.method}: ${result}`);
    }

    // Example 5: Error handling
    console.log('\n⚠️ Example 5: Error Handling');
    console.log('---------------------------');

    try {
      // This should fail - trying to access non-existent key
      const errorSim = await manager.simulateInvocation({
        contractId,
        method: 'get_non_existent_value',
        args: [],
        networkPassphrase,
      });

      if (errorSim.error) {
        console.log(`🔍 Expected simulation error: ${errorSim.error}`);
      } else {
        // Try to execute - should fail at runtime
        await manager.invokeContract({
          contractId,
          method: 'get_non_existent_value',
          args: [],
          caller: caller,
          networkPassphrase,
        });
      }
    } catch (error) {
      console.log(`✅ Successfully caught expected error: ${error.message}`);
    }

    // Example 6: Batch operations simulation
    console.log('\n📦 Example 6: Batch Operations');
    console.log('-------------------------------');

    const batchOperations = [
      { name: 'increment_counter', args: [] },
      { name: 'increment_counter', args: [] },
      { name: 'get_counter', args: [] },
    ];

    console.log('🔍 Simulating batch operations...');
    const batchSimulations = await Promise.all(
      batchOperations.map(op =>
        manager.simulateInvocation({
          contractId,
          method: op.name,
          args: op.args,
          networkPassphrase,
        })
      )
    );

    console.log('📊 Batch Simulation Results:');
    batchSimulations.forEach((sim, index) => {
      const op = batchOperations[index];
      console.log(
        `  ${op.name}: ${sim.error ? '❌ ' + sim.error : '✅ Success'}`
      );
      if (!sim.error) {
        console.log(
          `    CPU: ${sim.cpuInstructions}, Memory: ${sim.memoryBytes} bytes`
        );
      }
    });

    console.log('\n🎉 Contract invocation examples completed!');
    console.log(
      `🔗 Transaction Explorer: https://stellar.expert/explorer/testnet/account/${caller.publicKey()}`
    );
  } catch (error) {
    console.error('❌ Contract invocation failed:', error.message);

    if (error.message.includes('insufficient fee')) {
      console.log('💡 Tip: Increase the fee or check account balance');
    }

    if (error.message.includes('Simulation failed')) {
      console.log('💡 Tip: Check your function arguments and contract state');
    }

    if (error.message.includes('contract not found')) {
      console.log('💡 Tip: Verify the contract ID is correct and deployed');
    }
  }
}

// Helper function to validate function arguments
async function validateFunctionArguments(
  manager: SorobanContractManager,
  contractId: string,
  methodName: string,
  args: any[],
  networkPassphrase: string
): Promise<boolean> {
  try {
    const simulation = await manager.simulateInvocation({
      contractId,
      method: methodName,
      args,
      networkPassphrase,
    });

    return !simulation.error;
  } catch (error) {
    return false;
  }
}

// Helper function to estimate transaction costs
async function estimateTransactionCosts(
  manager: SorobanContractManager,
  contractId: string,
  operations: Array<{ method: string; args: any[] }>,
  networkPassphrase: string
): Promise<{ totalCpu: number; totalMemory: number; totalFee: string }> {
  let totalCpu = 0;
  let totalMemory = 0;
  let totalFee = 0;

  for (const op of operations) {
    const sim = await manager.simulateInvocation({
      contractId,
      method: op.method,
      args: op.args,
      networkPassphrase,
    });

    if (!sim.error) {
      totalCpu += sim.cpuInstructions;
      totalMemory += sim.memoryBytes;
      totalFee += parseInt(sim.minResourceFee || '0');
    }
  }

  return {
    totalCpu,
    totalMemory,
    totalFee: totalFee.toString(),
  };
}

// Run example
if (require.main === module) {
  invokeContractExample()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Example failed:', error);
      process.exit(1);
    });
}

export {
  invokeContractExample,
  validateFunctionArguments,
  estimateTransactionCosts,
};
