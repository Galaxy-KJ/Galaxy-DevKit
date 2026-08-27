/**
 * @fileoverview Contract Factory
 * @description Factory for deploying and managing Soroban contracts
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Keypair, xdr } from '@stellar/stellar-sdk';
import { SorobanContractManager } from '../soroban-contract-manager.js';
import { ScValConverter } from '../utils/scval-converter.js';
import { predictContractAddress } from '../utils/contract-address.js';
import {
  ContractFactoryConfig,
  ContractDeploymentParams,
  ContractDeploymentResult,
} from '../types/contract-types.js';

export class ContractFactory {
  private manager: SorobanContractManager;
  private wasm: Buffer;
  private networkPassphrase: string;

  constructor(config: ContractFactoryConfig) {
    this.wasm = config.wasm;
    this.networkPassphrase = config.networkPassphrase;
    this.manager = new SorobanContractManager();
  }

  /**
   * Deploy contract with default parameters
   */
  async deploy(deployer?: Keypair): Promise<ContractDeploymentResult> {
    const keypair = deployer || Keypair.random();

    return await this.manager.deployContract({
      wasm: this.wasm,
      deployer: keypair,
      networkPassphrase: this.networkPassphrase,
    });
  }

  /**
   * Deploy contract with custom parameters
   */
  async deployWithParams(
    params: Omit<ContractDeploymentParams, 'wasm' | 'networkPassphrase'>
  ): Promise<ContractDeploymentResult> {
    return await this.manager.deployContract({
      ...params,
      wasm: this.wasm,
      networkPassphrase: this.networkPassphrase,
    });
  }

  /**
   * Deploy contract with salt for deterministic address
   */
  async deployWithSalt(
    deployer: Keypair,
    salt: string | xdr.ScVal
  ): Promise<ContractDeploymentResult> {
    const scSalt =
      typeof salt === 'string' ? ScValConverter.toScVal(salt) : salt;

    return await this.manager.deployContract({
      wasm: this.wasm,
      deployer,
      networkPassphrase: this.networkPassphrase,
      salt: scSalt,
    });
  }

  /**
   * Get predicted contract address.
   *
   * Deterministic: the same `deployer` + `salt` + network passphrase always
   * returns the same `C...` strkey, matching the contract id a subsequent
   * deployment with those inputs will produce on-chain (CAP-46). The salt is
   * required and must normalize to exactly 32 bytes; see
   * {@link normalizeSalt} for accepted input types.
   *
   * @throws {Error} If the salt cannot be normalized to 32 bytes.
   */
  getPredictedAddress(deployer: Keypair, salt: string | Buffer | xdr.ScVal): string {
    return predictContractAddress(
      deployer.publicKey(),
      salt,
      this.networkPassphrase
    );
  }

  /**
   * Get manager instance
   */
  getManager(): SorobanContractManager {
    return this.manager;
  }

  /**
   * Get WASM buffer
   */
  getWasm(): Buffer {
    return this.wasm;
  }

  /**
   * Get network passphrase
   */
  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }
}
