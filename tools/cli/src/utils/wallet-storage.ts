/**
 * @fileoverview Wallet Storage Utility
 * @description Delegates to @galaxy-kj/core encrypted wallet store
 */

import {
  WalletStore,
  defaultWalletStore,
  type WalletListEntry,
} from '@galaxy-kj/core';

export interface WalletData {
  publicKey: string;
  secretKey: string;
  network: 'testnet' | 'mainnet';
  createdAt: string;
  importedAt?: string;
  name?: string;
}

export type WalletInfo = WalletListEntry;

export class WalletStorage {
  private store: WalletStore;

  constructor(store: WalletStore = defaultWalletStore) {
    this.store = store;
  }

  async ensureDir(): Promise<void> {
    return this.store.ensureDir();
  }

  getWalletsDir(): string {
    return this.store.getWalletsDir();
  }

  getWalletPath(name: string): string {
    return this.store.getWalletPath(name);
  }

  async walletExists(name: string): Promise<boolean> {
    return this.store.walletExists(name);
  }

  async saveWallet(name: string, data: WalletData): Promise<void> {
    await this.store.saveWallet(name, data.secretKey, {
      publicKey: data.publicKey,
      network: data.network,
      createdAt: data.createdAt,
      importedAt: data.importedAt,
    });
  }

  async loadWallet(name: string): Promise<WalletData | null> {
    const record = await this.store.loadWalletRecord(name);
    if (!record) {
      return null;
    }
    const secretKey = await this.store.getSecretKey(name);
    if (!secretKey) {
      return null;
    }
    return {
      publicKey: record.publicKey,
      secretKey,
      network: record.network,
      createdAt: record.createdAt,
      importedAt: record.importedAt,
    };
  }

  async deleteWallet(name: string): Promise<boolean> {
    return this.store.deleteWallet(name);
  }

  async listWallets(): Promise<WalletInfo[]> {
    return this.store.listWallets();
  }

  async getAllWallets(): Promise<(WalletData & { name: string })[]> {
    const entries = await this.store.listWallets();
    const wallets: (WalletData & { name: string })[] = [];
    for (const entry of entries) {
      const data = await this.loadWallet(entry.name);
      if (data) {
        wallets.push({ ...data, name: entry.name });
      }
    }
    return wallets;
  }

  /** @deprecated Use WalletStore.encrypt via @galaxy-kj/core */
  static encrypt(text: string, password: string) {
    return WalletStore.encrypt(text, password);
  }

  /** @deprecated Use WalletStore.decrypt via @galaxy-kj/core */
  static decrypt(encryptedData: Parameters<typeof WalletStore.decrypt>[0], password: string) {
    return WalletStore.decrypt(encryptedData, password);
  }
}

export const walletStorage = new WalletStorage();
