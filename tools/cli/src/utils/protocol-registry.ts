/**
 * @fileoverview Protocol Registry Utility
 * @description Creates, configures, and caches DeFi protocol instances by network
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-30
 */

import inquirer from 'inquirer';
import {
  IDefiProtocol,
  ProtocolType,
  ProtocolConfig,
  getNetworkConfig,
  PROTOCOL_IDS,
  PROTOCOL_NAMES,
  getProtocolFactory,
} from '@galaxy/core-defi-protocols';
import { walletStorage, WalletData } from './wallet-storage.js';

/**
 * Protocol capability types
 */
export enum ProtocolCapability {
  LENDING = 'lending',
  BORROWING = 'borrowing',
  SWAP = 'swap',
  LIQUIDITY = 'liquidity',
}

/**
 * Supported protocol definition
 */
export interface SupportedProtocol {
  id: string;
  name: string;
  type: ProtocolType;
  description: string;
  networks: ('testnet' | 'mainnet')[];
  capabilities: ProtocolCapability[];
}

/**
 * Cached protocol entry
 */
interface CachedProtocol {
  protocol: IDefiProtocol;
  network: 'testnet' | 'mainnet';
  initializedAt: Date;
}

/**
 * Wallet selection result
 */
export interface WalletSelection {
  name: string;
  publicKey: string;
  secretKey: string;
  network: 'testnet' | 'mainnet';
}

/**
 * Transaction preview for confirmation
 */
export interface TransactionPreview {
  operation: string;
  protocol: string;
  network: string;
  asset?: string;
  amount?: string;
  estimatedFee: string;
  walletAddress: string;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
  expectedAmountOut?: string;
  minimumReceived?: string;
  priceImpact?: string;
  slippage?: string;
}

/**
 * Protocol contract addresses by network
 */
const PROTOCOL_CONTRACTS: Record<string, Record<string, Record<string, string>>> = {
  [PROTOCOL_IDS.BLEND]: {
    testnet: {
      pool: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
      poolFactory: 'CBQDHNBFBZYE4MKPWBSJOPIYLW4SFSXAXUTSXJN76GNKYVYPE7SMWU7E',
    },
    mainnet: {
      pool: '', // To be filled when mainnet is available
      poolFactory: '',
    },
  },
  [PROTOCOL_IDS.SOROSWAP]: {
    testnet: {
      router: 'CBQDHNBFBZYE4MKPWBSJOPIYLW4SFSXAXUTSXJN76GNKYVYPE7SMWU7E',
      factory: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    },
    mainnet: {
      router: '',
      factory: '',
    },
  },
};

/**
 * List of supported protocols
 */
export const SUPPORTED_PROTOCOLS: SupportedProtocol[] = [
  {
    id: PROTOCOL_IDS.BLEND,
    name: PROTOCOL_NAMES[PROTOCOL_IDS.BLEND],
    type: ProtocolType.LENDING,
    description: 'Lending and borrowing protocol on Stellar',
    networks: ['testnet', 'mainnet'],
    capabilities: [ProtocolCapability.LENDING, ProtocolCapability.BORROWING],
  },
  {
    id: PROTOCOL_IDS.SOROSWAP,
    name: PROTOCOL_NAMES[PROTOCOL_IDS.SOROSWAP],
    type: ProtocolType.DEX,
    description: 'Decentralized exchange on Stellar',
    networks: ['testnet', 'mainnet'],
    capabilities: [ProtocolCapability.SWAP, ProtocolCapability.LIQUIDITY],
  },
];

/**
 * Protocol instance cache
 */
const protocolCache = new Map<string, CachedProtocol>();

/**
 * Build cache key for protocol
 */
function buildCacheKey(protocolId: string, network: 'testnet' | 'mainnet'): string {
  return `${protocolId}:${network}`;
}

/**
 * List available protocols
 * @param network - Optional network filter
 * @returns Array of supported protocols
 */
export function listSupportedProtocols(network?: 'testnet' | 'mainnet'): SupportedProtocol[] {
  if (!network) {
    return SUPPORTED_PROTOCOLS;
  }
  return SUPPORTED_PROTOCOLS.filter((p) => p.networks.includes(network));
}

/**
 * Get protocol info by ID
 * @param protocolId - Protocol identifier
 * @returns Protocol info or undefined
 */
export function getProtocolInfo(protocolId: string): SupportedProtocol | undefined {
  return SUPPORTED_PROTOCOLS.find((p) => p.id === protocolId.toLowerCase());
}

/**
 * Get protocol instance from cache or create new
 * @param protocolId - Protocol identifier
 * @param network - Target network
 * @returns Protocol instance
 */
export async function getProtocolInstance(
  protocolId: string,
  network: 'testnet' | 'mainnet'
): Promise<IDefiProtocol> {
  const normalizedId = protocolId.toLowerCase();
  const cacheKey = buildCacheKey(normalizedId, network);

  // Check cache
  const cached = protocolCache.get(cacheKey);
  if (cached) {
    return cached.protocol;
  }

  // Validate protocol is supported
  const protocolInfo = getProtocolInfo(normalizedId);
  if (!protocolInfo) {
    const supported = SUPPORTED_PROTOCOLS.map((p) => p.id).join(', ');
    throw new Error(`Protocol '${protocolId}' is not supported. Available: ${supported}`);
  }

  // Check if protocol is available on network
  if (!protocolInfo.networks.includes(network)) {
    throw new Error(
      `Protocol '${protocolInfo.name}' is not available on ${network}. ` +
        `Available networks: ${protocolInfo.networks.join(', ')}`
    );
  }

  // Build protocol configuration
  const networkConfig = getNetworkConfig(network);
  const contracts = PROTOCOL_CONTRACTS[normalizedId]?.[network] || {};

  const config: ProtocolConfig = {
    protocolId: normalizedId,
    name: protocolInfo.name,
    network: networkConfig,
    contractAddresses: contracts,
    metadata: {
      type: protocolInfo.type,
      capabilities: protocolInfo.capabilities,
    },
  };

  // Create protocol instance using factory
  const factory = getProtocolFactory();
  const protocol = factory.createProtocol(config);

  // Cache the instance
  protocolCache.set(cacheKey, {
    protocol,
    network,
    initializedAt: new Date(),
  });

  return protocol;
}

/**
 * Clear the protocol cache (useful for testing)
 */
export function clearProtocolCache(): void {
  protocolCache.clear();
}

/**
 * Select wallet for transaction signing
 * @param options - Selection options
 * @returns Selected wallet
 */
export async function selectWallet(options: {
  wallet?: string;
  network: 'testnet' | 'mainnet';
  json?: boolean;
}): Promise<WalletSelection> {
  // If wallet name provided, load directly
  if (options.wallet) {
    const wallet = await walletStorage.loadWallet(options.wallet);
    if (!wallet) {
      throw new Error(`Wallet '${options.wallet}' not found`);
    }

    // Verify network matches
    if (wallet.network !== options.network) {
      throw new Error(
        `Wallet '${options.wallet}' is configured for ${wallet.network}, ` +
          `but operation targets ${options.network}`
      );
    }

    return {
      name: options.wallet,
      publicKey: wallet.publicKey,
      secretKey: wallet.secretKey,
      network: wallet.network,
    };
  }

  // In JSON mode, wallet is required
  if (options.json) {
    throw new Error('Wallet name is required in JSON mode. Use --wallet option.');
  }

  // Interactive wallet selection
  const wallets = await walletStorage.listWallets();
  const networkWallets = wallets.filter((w) => w.network === options.network);

  if (networkWallets.length === 0) {
    throw new Error(
      `No wallets found for ${options.network}. ` +
        `Create one with "galaxy wallet create --${options.network}"`
    );
  }

  const { selectedWallet } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedWallet',
      message: 'Select wallet for signing:',
      choices: networkWallets.map((w) => ({
        name: `${w.name} (${w.publicKey.slice(0, 8)}...${w.publicKey.slice(-4)})`,
        value: w.name,
      })),
    },
  ]);

  const wallet = await walletStorage.loadWallet(selectedWallet);
  if (!wallet) {
    throw new Error(`Failed to load wallet '${selectedWallet}'`);
  }

  return {
    name: selectedWallet,
    publicKey: wallet.publicKey,
    secretKey: wallet.secretKey,
    network: wallet.network,
  };
}

/**
 * Confirm transaction before execution
 * @param preview - Transaction preview
 * @param options - Confirmation options
 * @returns Whether user confirmed
 */
export async function confirmTransaction(
  preview: TransactionPreview,
  options: { yes?: boolean; json?: boolean }
): Promise<boolean> {
  // Skip if --yes flag provided
  if (options.yes) {
    return true;
  }

  // In JSON mode, require --yes
  if (options.json) {
    throw new Error('Transaction confirmation required. Use --yes to skip in JSON mode.');
  }

  // Interactive confirmation
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Do you want to proceed with this transaction?',
      default: false,
    },
  ]);

  return confirmed;
}

/**
 * Validate amount is a positive number
 * @param amount - Amount to validate
 * @param fieldName - Field name for error message
 */
export function validateAmount(amount: string, fieldName: string = 'Amount'): void {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
}

/**
 * Validate slippage is a valid percentage
 * @param slippage - Slippage percentage
 * @returns Validated slippage as decimal
 */
export function validateSlippage(slippage: string): string {
  const numSlippage = parseFloat(slippage);
  if (isNaN(numSlippage) || numSlippage < 0 || numSlippage > 100) {
    throw new Error('Slippage must be a number between 0 and 100');
  }
  return (numSlippage / 100).toString();
}

/**
 * Get Stellar Expert URL for a transaction
 * @param hash - Transaction hash
 * @param network - Network name
 * @returns Explorer URL
 */
export function getExplorerUrl(hash: string, network: 'testnet' | 'mainnet'): string {
  const baseUrl =
    network === 'mainnet'
      ? 'https://stellar.expert/explorer/public'
      : 'https://stellar.expert/explorer/testnet';
  return `${baseUrl}/tx/${hash}`;
}
