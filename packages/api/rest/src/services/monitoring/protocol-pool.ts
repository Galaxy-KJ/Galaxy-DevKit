/**
 * @fileoverview Lazy, network-scoped pool of DeFi protocol clients.
 * @description Each call to ProtocolFactory builds a heavy client (RPC, contract
 *              bindings). The worker would call it once per alert per tick if we
 *              didn't cache, which would blow up our RPC budget. This pool keeps
 *              one client per (protocol, network) tuple for the worker's lifetime.
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import { getProtocolFactory, IDefiProtocol, ProtocolConfig } from '@galaxy-kj/core-defi-protocols';
import { StellarNetworkName } from '../../types/monitoring-types';

const TESTNET: ProtocolConfig['network'] = {
  network: 'testnet',
  horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
  passphrase: process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
};

const MAINNET: ProtocolConfig['network'] = {
  network: 'mainnet',
  horizonUrl: process.env.STELLAR_HORIZON_URL_MAINNET || 'https://horizon.stellar.org',
  sorobanRpcUrl: process.env.STELLAR_RPC_URL_MAINNET || 'https://soroban-rpc.mainnet.stellar.gateway.fm',
  passphrase: process.env.STELLAR_NETWORK_PASSPHRASE_MAINNET || 'Public Global Stellar Network ; September 2015',
};

const BLEND_ADDRESSES = {
  pool: process.env.BLEND_POOL_ADDRESS || 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF',
  oracle: process.env.BLEND_ORACLE_ADDRESS || 'CAZOKR2Y5E2OSWSIBRVZMJ47RUTQPIGVWSAQ2UISGAVC46XKPGDG5PKI',
  backstop: process.env.BLEND_BACKSTOP_ADDRESS || 'CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA',
  emitter: process.env.BLEND_EMITTER_ADDRESS || 'CC3WJVJINN4E3LPMNTWKK7LQZLYDQMZHZA7EZGXATPHHBPKNZRIO3KZ6',
};

export class ProtocolPool {
  private cache = new Map<string, IDefiProtocol>();

  get(protocol: string, network: StellarNetworkName): IDefiProtocol {
    const key = `${protocol}:${network}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const client = this.build(protocol, network);
    this.cache.set(key, client);
    return client;
  }

  private build(protocol: string, network: StellarNetworkName): IDefiProtocol {
    const factory = getProtocolFactory();
    return factory.createProtocol({
      protocolId: protocol,
      name: `Monitoring/${protocol}`,
      metadata: {},
      network: network === 'mainnet' ? MAINNET : TESTNET,
      contractAddresses: BLEND_ADDRESSES,
    });
  }
}
