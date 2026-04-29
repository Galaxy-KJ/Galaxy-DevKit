import fs from 'fs';
import { SorobanContractManager } from '@galaxy-kj/core-stellar-sdk';
import { Keypair, Networks } from '@stellar/stellar-sdk';

/**
 * Deploys a Soroban contract from a WASM file
 * @param wasmPath Path to the .wasm file
 * @param deployer Keypair of the deployer
 * @returns Deployment result including contractId
 */
export async function deployContract(
  wasmPath: string,
  deployer: Keypair
): Promise<{ contractId: string; transactionHash: string }> {
  const manager = new SorobanContractManager();
  const wasm = fs.readFileSync(wasmPath);
  
  const result = await manager.deployContract({
    wasm,
    deployer,
    networkPassphrase: Networks.TESTNET,
  });

  return {
    contractId: result.contractId,
    transactionHash: result.transactionHash,
  };
}

/**
 * Fixture for deploying the Price Oracle contract for testing
 */
export async function deployPriceOracleFixture(deployer: Keypair) {
  // Path might need adjustment depending on where the test is run
  const wasmPath = './packages/contracts/price-oracle/target/wasm32-unknown-unknown/release/price_oracle.wasm';
  return await deployContract(wasmPath, deployer);
}

/**
 * Fixture for deploying the Smart Swap contract for testing
 */
export async function deploySmartSwapFixture(deployer: Keypair) {
  const wasmPath = './packages/contracts/smart-swap/target/wasm32-unknown-unknown/release/smart_swap.wasm';
  return await deployContract(wasmPath, deployer);
}
