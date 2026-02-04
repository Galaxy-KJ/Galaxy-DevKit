/**
 * @fileoverview Blend Protocol Configuration
 * @description Network configurations and contract addresses for Blend Protocol
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-29
 */

import { ProtocolConfig } from '../../types/defi-types.js';

/**
 * Blend Protocol Testnet Configuration
 * @description Official Blend Protocol contracts on Stellar Testnet
 * @see https://testnet.blend.capital/
 */
export const BLEND_TESTNET_CONFIG: ProtocolConfig = {
  protocolId: 'blend',
  name: 'Blend Protocol',
  network: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015'
  },
  contractAddresses: {
    // Blend Pool Contract V2 - Main lending pool (TestnetV2)
    pool: 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF',

    // Oracle Contract - Price feeds (oraclemock)
    oracle: 'CAZOKR2Y5E2OSWSIBRVZMJ47RUTQPIGVWSAQ2UISGAVC46XKPGDG5PKI',

    // Backstop Contract V2 - Liquidity backstop module
    backstop: 'CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA',

    // Emitter Contract - Reward emissions
    emitter: 'CC3WJVJINN4E3LPMNTWKK7LQZLYDQMZHZA7EZGXATPHHBPKNZRIO3KZ6',

    // Pool Factory V2 - Pool deployment factory
    poolFactory: 'CDV6RX4CGPCOKGTBFS52V3LMWQGZN3LCQTXF5RVPOOCG4XVMHXQ4NTF6',

    // Comet Factory - Comet contract factory
    cometFactory: 'CDX2TKELFKHP2MWISDCXWWZ73CL7F57GHYRJAWJWNOTLNJNNM7XLT4JY',

    // Comet Contract - Lending comet
    comet: 'CA5UTUUPHYL5K22UBRUVC37EARZUGYOSGK3IKIXG2JLCC5ZZLI4BDWDM'
  },
  metadata: {
    environment: 'testnet',
    version: '1.0.0',
    documentation: 'https://docs.blend.capital/',
    website: 'https://testnet.blend.capital/'
  }
};

/**
 * Blend Protocol Mainnet Configuration
 * @description Official Blend Protocol contracts on Stellar Mainnet
 * @note Mainnet addresses to be updated when available
 * @see https://blend.capital/
 */
export const BLEND_MAINNET_CONFIG: ProtocolConfig = {
  protocolId: 'blend',
  name: 'Blend Protocol',
  network: {
    network: 'mainnet',
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban-rpc.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015'
  },
  contractAddresses: {
    pool: 'TODO_MAINNET_POOL_ADDRESS',
    oracle: 'TODO_MAINNET_ORACLE_ADDRESS',
    backstop: 'TODO_MAINNET_BACKSTOP_ADDRESS',
    emitter: 'TODO_MAINNET_EMITTER_ADDRESS'
  },
  metadata: {
    environment: 'mainnet',
    version: '1.0.0',
    documentation: 'https://docs.blend.capital/',
    website: 'https://blend.capital/'
  }
};

/**
 * Known asset contract addresses on Testnet
 * @description Common assets available on Blend Testnet
 */
export const BLEND_TESTNET_ASSETS = {
  // XLM (Native Stellar wrapped in Soroban)
  XLM: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',

  // BLND - Blend Protocol Token
  BLND: 'CB22KRA3YZVCNCQI64JQ5WE7UY2VAV7WFLK6A2JN3HEX56T2EDAFO7QF',

  // USDC on Testnet
  USDC: 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU',

  // wETH - Wrapped Ethereum
  wETH: 'CAZAQB3D7KSLSNOSQKYD2V4JP5V2Y3B4RDJZRLBFCCIXDCTE3WHSY3UE',

  // wBTC - Wrapped Bitcoin
  wBTC: 'CAP5AMC2OHNVREO66DFIN6DHJMPOBAJ2KCDDIMFBR7WWJH5RZBFM3UEI'
} as const;

/**
 * Asset decimal places configuration
 * @description Number of decimal places for each asset
 */
export const ASSET_DECIMALS: Record<string, number> = {
  XLM: 7,
  BLND: 7,
  USDC: 6,
  wETH: 18,
  wBTC: 8
};

/**
 * Contract WASM hashes for testnet
 * @description SHA256 hashes of deployed contract WASM
 */
export const BLEND_TESTNET_HASHES = {
  comet: '8abc28913035c07411ed5d134e6bfeab4723d97ddd4d1a22a0605d35c94d1a36',
  cometFactory: 'bf7adb09076853eb3aa569278754111d86e161e35e7dc6a984ecde2b9d6700ae',
  oraclemock: '66c0b87b5eb481be594175d59e66ec9a9ac8945be0fec4e09f6c28bf7a1708be',
  poolFactoryV2: '31328050548831f63d2b72e37bcfd0bb7371b7907135755dbe09ed434d755ca9',
  backstopV2: 'c1f4502a757e25c611f5a159bc1ab0eef64085adac6c68123dca66e87faffbc2',
  lendingPoolV2: 'a41fc53d6753b6c04eb15b021c55052366a4c8e0e21bc72700f461264ec1350e',
  emitter: '438a5528cff17ede6fe515f095c43c5f15727af17d006971485e52462e7e7b89'
} as const;

/**
 * Convert human-readable amount to stroops (smallest unit)
 * @param amount - Amount in human-readable format
 * @param assetCode - Asset code (XLM, USDC, etc.)
 * @returns Amount in stroops as string
 */
export function convertToStroops(amount: string | number, assetCode: string): string {
  const decimals = ASSET_DECIMALS[assetCode] || 7; // Default to 7 decimals
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Math.floor(numAmount * Math.pow(10, decimals)).toString();
}

/**
 * Convert stroops to human-readable amount
 * @param stroops - Amount in stroops
 * @param assetCode - Asset code (XLM, USDC, etc.)
 * @returns Human-readable amount
 */
export function convertFromStroops(stroops: string | number, assetCode: string): string {
  const decimals = ASSET_DECIMALS[assetCode] || 7;
  const numStroops = typeof stroops === 'string' ? parseFloat(stroops) : stroops;
  return (numStroops / Math.pow(10, decimals)).toString();
}

/**
 * Get Blend configuration for a specific network
 * @param {string} network - Network name ('testnet' or 'mainnet')
 * @returns {ProtocolConfig} Blend protocol configuration
 */
export function getBlendConfig(network: 'testnet' | 'mainnet'): ProtocolConfig {
  return network === 'mainnet' ? BLEND_MAINNET_CONFIG : BLEND_TESTNET_CONFIG;
}
