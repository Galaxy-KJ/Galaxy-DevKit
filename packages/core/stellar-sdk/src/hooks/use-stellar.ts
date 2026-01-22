/**
 * @fileoverview React hook for Stellar operations
 * @description Provides Stellar state and operations to React components
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

// import { useState, useEffect, useCallback } from 'react';
import { StellarService } from '../services/stellar-service';
import {
  Wallet,
  WalletConfig,
  NetworkConfig,
  AccountInfo,
  Balance,
  PaymentParams,
  PaymentResult,
  TransactionInfo,
} from '../types/stellar-types';
import type {
  CreateClaimableBalanceParams,
  ClaimBalanceParams,
  QueryClaimableBalancesParams,
  ClaimableBalanceResult,
  ClaimableBalance,
} from '../claimable-balances/types';

/**
 * Custom hook for Stellar operations
 * @param networkConfig - Network configuration
 * @returns Stellar state and operations
 */
export const useStellar = (networkConfig: NetworkConfig) => {
  const stellarService = new StellarService(networkConfig);
  let wallet: Wallet | null = null;
  let accountInfo: AccountInfo | null = null;
  let balance: Balance | null = null;
  let transactionHistory: TransactionInfo[] = [];
  let loading = false;
  let error: string | null = null;

  /**
   * Creates a new wallet
   * @param config - Wallet configuration
   */
  const createWallet = async (
    config: Partial<WalletConfig>,
    password: string
  ) => {
    try {
      loading = true;
      error = null;
      const newWallet = await stellarService.createWallet(config, password);
      wallet = newWallet;
      return newWallet;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create wallet';
      error = errorMessage;
      throw new Error(errorMessage);
    } finally {
      loading = false;
    }
  };

  /**
   * Connects to an existing wallet
   * @param walletConfig - Wallet configuration
   */
  const connectWallet = async (walletConfig: WalletConfig) => {
    try {
      loading = true;
      error = null;

      // Create wallet object from config
      const newWallet: Wallet = {
        id: `wallet_${Date.now()}`,
        publicKey: walletConfig.publicKey,
        privateKey: walletConfig.privateKey,
        network: walletConfig.network,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      };

      wallet = newWallet;

      // Load account info
      const account = await stellarService.getAccountInfo(wallet.publicKey);
      accountInfo = account;

      // Load balance
      const walletBalance = await stellarService.getBalance(wallet.publicKey);
      balance = walletBalance;

      return wallet;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to connect wallet';
      error = errorMessage;
      throw new Error(errorMessage);
    } finally {
      loading = false;
    }
  };

  /**
   * Disconnects the current wallet
   */
  const disconnectWallet = () => {
    wallet = null;
    accountInfo = null;
    balance = null;
    transactionHistory = [];
    error = null;
  };

  /**
   * Sends a payment
   * @param params - Payment parameters
   */
  const sendPayment = async (
    params: PaymentParams,
    password: string
  ): Promise<PaymentResult> => {
    if (!wallet) {
      throw new Error('No wallet connected');
    }
    if (!password) {
      throw new Error('No password   given');
    }

    try {
      loading = true;
      error = null;
      const result = await stellarService.sendPayment(wallet, params, password);

      // Refresh account info after payment
      const account = await stellarService.getAccountInfo(wallet.publicKey);
      accountInfo = account;

      const walletBalance = await stellarService.getBalance(wallet.publicKey);
      balance = walletBalance;

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to send payment';
      error = errorMessage;
      throw new Error(errorMessage);
    } finally {
      loading = false;
    }
  };

  /**
   * Refreshes account information
   */
  const refreshAccount = async () => {
    if (!wallet) return;

    try {
      loading = true;
      error = null;

      const account = await stellarService.getAccountInfo(wallet.publicKey);
      accountInfo = account;

      const walletBalance = await stellarService.getBalance(wallet.publicKey);
      balance = walletBalance;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to refresh account';
      error = errorMessage;
    } finally {
      loading = false;
    }
  };

  /**
   * Loads transaction history
   * @param limit - Number of transactions to load
   */
  const loadTransactionHistory = async (limit: number = 10) => {
    if (!wallet) return;

    try {
      loading = true;
      error = null;

      const history = await stellarService.getTransactionHistory(
        wallet.publicKey,
        limit
      );
      transactionHistory = history;
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to load transaction history';
      error = errorMessage;
    } finally {
      loading = false;
    }
  };

  /**
   * Switches network
   * @param networkConfig - New network configuration
   */
  const switchNetwork = (networkConfig: NetworkConfig) => {
    stellarService.switchNetwork(networkConfig);
    disconnectWallet();
  };

  /**
   * Creates a claimable balance
   * @param params - Create claimable balance parameters
   * @param password - Wallet password
   */
  const createClaimableBalance = async (
    params: CreateClaimableBalanceParams,
    password: string
  ): Promise<ClaimableBalanceResult> => {
    if (!wallet) {
      throw new Error('No wallet connected');
    }
    if (!password) {
      throw new Error('No password given');
    }

    try {
      loading = true;
      error = null;
      const result = await stellarService.createClaimableBalance(
        wallet,
        params,
        password
      );

      // Refresh account info after creating balance
      const account = await stellarService.getAccountInfo(wallet.publicKey);
      accountInfo = account;

      const walletBalance = await stellarService.getBalance(wallet.publicKey);
      balance = walletBalance;

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to create claimable balance';
      error = errorMessage;
      throw new Error(errorMessage);
    } finally {
      loading = false;
    }
  };

  /**
   * Claims a claimable balance
   * @param params - Claim parameters
   * @param password - Wallet password
   */
  const claimBalance = async (
    params: ClaimBalanceParams,
    password: string
  ): Promise<ClaimableBalanceResult> => {
    if (!wallet) {
      throw new Error('No wallet connected');
    }
    if (!password) {
      throw new Error('No password given');
    }

    try {
      loading = true;
      error = null;
      const result = await stellarService.claimBalance(wallet, params, password);

      // Refresh account info after claiming
      const account = await stellarService.getAccountInfo(wallet.publicKey);
      accountInfo = account;

      const walletBalance = await stellarService.getBalance(wallet.publicKey);
      balance = walletBalance;

      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to claim balance';
      error = errorMessage;
      throw new Error(errorMessage);
    } finally {
      loading = false;
    }
  };

  /**
   * Gets claimable balances for current account
   * @param limit - Number of results to return
   */
  const getClaimableBalances = async (
    limit: number = 10
  ): Promise<ClaimableBalance[]> => {
    if (!wallet) {
      throw new Error('No wallet connected');
    }

    try {
      loading = true;
      error = null;
      const balances = await stellarService.getClaimableBalancesForAccount(
        wallet.publicKey,
        limit
      );
      return balances;
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to get claimable balances';
      error = errorMessage;
      throw new Error(errorMessage);
    } finally {
      loading = false;
    }
  };

  /**
   * Gets claimable balance details by ID
   * @param balanceId - Balance ID
   */
  const getClaimableBalance = async (
    balanceId: string
  ): Promise<ClaimableBalance> => {
    try {
      loading = true;
      error = null;
      const balance = await stellarService.getClaimableBalance(balanceId);
      return balance;
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to get claimable balance';
      error = errorMessage;
      throw new Error(errorMessage);
    } finally {
      loading = false;
    }
  };

  return {
    // State
    wallet,
    accountInfo,
    balance,
    transactionHistory,
    loading,
    error,

    // Actions
    createWallet,
    connectWallet,
    disconnectWallet,
    sendPayment,
    refreshAccount,
    loadTransactionHistory,
    switchNetwork,

    // Claimable Balance Actions
    createClaimableBalance,
    claimBalance,
    getClaimableBalances,
    getClaimableBalance,

    // Service
    stellarService,
  };
};
