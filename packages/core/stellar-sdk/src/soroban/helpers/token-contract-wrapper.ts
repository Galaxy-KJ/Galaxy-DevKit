/**
 * @fileoverview Token Contract Wrapper
 * @description Wrapper for Soroban token contracts with common operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Keypair, xdr } from '@stellar/stellar-sdk';
import { SorobanContractManager } from '../soroban-contract-manager';
import { ScValConverter } from '../utils/scval-converter';
import { TokenContractInfo } from '../types/contract-types';

export class TokenContractWrapper {
  private manager: SorobanContractManager;
  private contractId: string;
  private networkPassphrase: string;

  constructor(contractId: string, networkPassphrase: string, rpcUrl?: string) {
    this.contractId = contractId;
    this.networkPassphrase = networkPassphrase;
    this.manager = new SorobanContractManager(rpcUrl);
  }

  /**
   * Get token information
   */
  async getInfo(): Promise<TokenContractInfo> {
    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'info',
      args: [],
      caller: Keypair.random(), // Use random key for read-only operations
      networkPassphrase: this.networkPassphrase,
      simulateOnly: true,
    });

    const info = ScValConverter.fromScVal(result.result);

    return {
      name: info.name || '',
      symbol: info.symbol || '',
      decimals: info.decimals || 0,
      totalSupply: info.total_supply?.toString() || '0',
      admin: info.admin || '',
    };
  }

  /**
   * Get token balance for an account
   */
  async getBalance(accountId: string): Promise<string> {
    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'balance',
      args: [accountId],
      caller: Keypair.random(),
      networkPassphrase: this.networkPassphrase,
      simulateOnly: true,
    });

    const balance = ScValConverter.fromScVal(result.result);
    return balance?.toString() || '0';
  }

  /**
   * Get allowance from spender to owner
   */
  async getAllowance(owner: string, spender: string): Promise<string> {
    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'allowance',
      args: [owner, spender],
      caller: Keypair.random(),
      networkPassphrase: this.networkPassphrase,
      simulateOnly: true,
    });

    const allowance = ScValConverter.fromScVal(result.result);
    return allowance?.toString() || '0';
  }

  /**
   * Transfer tokens
   */
  async transfer(
    from: Keypair,
    to: string,
    amount: string | number,
    memo?: string
  ): Promise<{ transactionHash: string; ledger: number }> {
    const amountStr = typeof amount === 'number' ? amount.toString() : amount;

    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'transfer',
      args: [from.publicKey(), to, amountStr],
      caller: from,
      networkPassphrase: this.networkPassphrase,
    });

    return {
      transactionHash: result.transactionHash,
      ledger: result.ledger,
    };
  }

  /**
   * Approve spender to use tokens
   */
  async approve(
    owner: Keypair,
    spender: string,
    amount: string | number,
    expirationLedger?: number
  ): Promise<{ transactionHash: string; ledger: number }> {
    const amountStr = typeof amount === 'number' ? amount.toString() : amount;
    const args = [owner.publicKey(), spender, amountStr];

    if (expirationLedger) {
      args.push(expirationLedger);
    }

    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'approve',
      args,
      caller: owner,
      networkPassphrase: this.networkPassphrase,
    });

    return {
      transactionHash: result.transactionHash,
      ledger: result.ledger,
    };
  }

  /**
   * Transfer tokens from approved spender
   */
  async transferFrom(
    spender: Keypair,
    from: string,
    to: string,
    amount: string | number
  ): Promise<{ transactionHash: string; ledger: number }> {
    const amountStr = typeof amount === 'number' ? amount.toString() : amount;

    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'transfer_from',
      args: [from, to, amountStr],
      caller: spender,
      networkPassphrase: this.networkPassphrase,
    });

    return {
      transactionHash: result.transactionHash,
      ledger: result.ledger,
    };
  }

  /**
   * Mint new tokens (admin only)
   */
  async mint(
    admin: Keypair,
    to: string,
    amount: string | number
  ): Promise<{ transactionHash: string; ledger: number }> {
    const amountStr = typeof amount === 'number' ? amount.toString() : amount;

    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'mint',
      args: [to, amountStr],
      caller: admin,
      networkPassphrase: this.networkPassphrase,
    });

    return {
      transactionHash: result.transactionHash,
      ledger: result.ledger,
    };
  }

  /**
   * Burn tokens
   */
  async burn(
    owner: Keypair,
    amount: string | number
  ): Promise<{ transactionHash: string; ledger: number }> {
    const amountStr = typeof amount === 'number' ? amount.toString() : amount;

    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'burn',
      args: [owner.publicKey(), amountStr],
      caller: owner,
      networkPassphrase: this.networkPassphrase,
    });

    return {
      transactionHash: result.transactionHash,
      ledger: result.ledger,
    };
  }

  /**
   * Get decimals
   */
  async getDecimals(): Promise<number> {
    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'decimals',
      args: [],
      caller: Keypair.random(),
      networkPassphrase: this.networkPassphrase,
      simulateOnly: true,
    });

    return ScValConverter.fromScVal(result.result) || 0;
  }

  /**
   * Get symbol
   */
  async getSymbol(): Promise<string> {
    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'symbol',
      args: [],
      caller: Keypair.random(),
      networkPassphrase: this.networkPassphrase,
      simulateOnly: true,
    });

    return ScValConverter.fromScVal(result.result) || '';
  }

  /**
   * Get name
   */
  async getName(): Promise<string> {
    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'name',
      args: [],
      caller: Keypair.random(),
      networkPassphrase: this.networkPassphrase,
      simulateOnly: true,
    });

    return ScValConverter.fromScVal(result.result) || '';
  }

  /**
   * Get total supply
   */
  async getTotalSupply(): Promise<string> {
    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'total_supply',
      args: [],
      caller: Keypair.random(),
      networkPassphrase: this.networkPassphrase,
      simulateOnly: true,
    });

    const supply = ScValConverter.fromScVal(result.result);
    return supply?.toString() || '0';
  }

  /**
   * Get admin address
   */
  async getAdmin(): Promise<string> {
    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'admin',
      args: [],
      caller: Keypair.random(),
      networkPassphrase: this.networkPassphrase,
      simulateOnly: true,
    });

    return ScValConverter.fromScVal(result.result) || '';
  }

  /**
   * Check if account exists
   */
  async isAccountInitialized(accountId: string): Promise<boolean> {
    const result = await this.manager.invokeContract({
      contractId: this.contractId,
      method: 'is_authorized',
      args: [accountId],
      caller: Keypair.random(),
      networkPassphrase: this.networkPassphrase,
      simulateOnly: true,
    });

    return ScValConverter.fromScVal(result.result) || false;
  }

  /**
   * Get contract manager instance
   */
  getManager(): SorobanContractManager {
    return this.manager;
  }

  /**
   * Get contract ID
   */
  getContractId(): string {
    return this.contractId;
  }

  /**
   * Format amount for display
   */
  formatAmount(amount: string | number, decimals?: number): string {
    const decimalsToUse = decimals || 7; // Default to 7 like Stellar lumens
    const num = typeof amount === 'string' ? BigInt(amount) : BigInt(amount);

    if (num === 0n) return '0';

    const divisor = 10n ** BigInt(decimalsToUse);
    const whole = num / divisor;
    const fraction = num % divisor;

    if (fraction === 0n) {
      return whole.toString();
    }

    const fractionStr = fraction.toString().padStart(decimalsToUse, '0');
    const trimmedFractionStr = fractionStr.replace(/0+$/, '');

    return `${whole}.${trimmedFractionStr}`;
  }

  /**
   * Parse amount from string to smallest unit
   */
  parseAmount(amount: string, decimals?: number): string {
    const decimalsToUse = decimals || 7;
    const [whole, fraction = ''] = amount.split('.');

    const wholeNum = BigInt(whole || '0');
    const fractionNum =
      fraction.length > 0
        ? BigInt(fraction.padEnd(decimalsToUse, '0').slice(0, decimalsToUse))
        : 0n;

    return (wholeNum * 10n ** BigInt(decimalsToUse) + fractionNum).toString();
  }
}
