import { Networks } from '@galaxy-kj/core-stellar-sdk';

export enum Network {
  TESTNET = 'TESTNET',
  MAINNET = 'MAINNET',
}

const NETWORK_STORAGE_KEY = 'galaxy_network';

const RPC_URLS = {
  [Network.TESTNET]: 'https://soroban-testnet.stellar.org',
  [Network.MAINNET]: 'https://soroban-mainnet.stellar.org', // Note: Verify actual mainnet RPC if needed
};

const NETWORK_PASSPHRASES = {
  [Network.TESTNET]: Networks.TESTNET,
  [Network.MAINNET]: Networks.PUBLIC,
};

export class NetworkManager {
  private currentNetwork: Network;

  constructor() {
    const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
    this.currentNetwork = (stored as Network) || Network.TESTNET;
  }

  getNetwork(): Network {
    return this.currentNetwork;
  }

  setNetwork(network: Network): void {
    this.currentNetwork = network;
    localStorage.setItem(NETWORK_STORAGE_KEY, network);
    window.location.reload(); // Simplest way to propagate change in this architecture
  }

  getRpcUrl(): string {
    return RPC_URLS[this.currentNetwork];
  }

  getPassphrase(): string {
    return NETWORK_PASSPHRASES[this.currentNetwork];
  }

  isReadOnly(): boolean {
    return this.currentNetwork === Network.MAINNET;
  }
}

export const networkManager = new NetworkManager();
