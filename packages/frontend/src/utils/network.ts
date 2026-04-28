import { Networks } from '@galaxy-kj/core-stellar-sdk';

export enum NetworkType {
  TESTNET = 'TESTNET',
  MAINNET = 'MAINNET',
}

export interface NetworkConfig {
  type: NetworkType;
  rpcUrl: string;
  networkPassphrase: string;
  isReadOnly: boolean;
}

const NETWORKS: Record<NetworkType, NetworkConfig> = {
  [NetworkType.TESTNET]: {
    type: NetworkType.TESTNET,
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    isReadOnly: false,
  },
  [NetworkType.MAINNET]: {
    type: NetworkType.MAINNET,
    rpcUrl: 'https://soroban-rpc.mainnet.stellar.org',
    networkPassphrase: Networks.PUBLIC,
    isReadOnly: true,
  },
};

const STORAGE_KEY = 'galaxy_network_selection';

export function getSelectedNetwork(): NetworkType {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === NetworkType.MAINNET) return NetworkType.MAINNET;
  return NetworkType.TESTNET;
}

export function setSelectedNetwork(network: NetworkType): void {
  localStorage.setItem(STORAGE_KEY, network);
  window.location.reload(); // Reload to apply network changes across the app
}

export function getCurrentNetworkConfig(): NetworkConfig {
  const type = getSelectedNetwork();
  return NETWORKS[type];
}

export function isMainnetReadOnly(): boolean {
  return getSelectedNetwork() === NetworkType.MAINNET;
}
