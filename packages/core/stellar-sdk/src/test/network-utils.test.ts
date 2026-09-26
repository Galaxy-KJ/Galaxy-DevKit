import { NETWORKS, resolveNetwork } from '../utils/network-utils.js';

describe('shared network configuration', () => {
  const original = {
    network: process.env.STELLAR_NETWORK,
    horizon: process.env.STELLAR_HORIZON_URL,
    rpc: process.env.STELLAR_RPC_URL,
    passphrase: process.env.STELLAR_NETWORK_PASSPHRASE,
  };

  afterEach(() => {
    process.env.STELLAR_NETWORK = original.network;
    process.env.STELLAR_HORIZON_URL = original.horizon;
    process.env.STELLAR_RPC_URL = original.rpc;
    process.env.STELLAR_NETWORK_PASSPHRASE = original.passphrase;
  });

  it('contains typed defaults for every supported network', () => {
    expect(NETWORKS.testnet.horizonUrl).toBe('https://horizon-testnet.stellar.org');
    expect(NETWORKS.mainnet.networkPassphrase).toBe('Public Global Stellar Network ; September 2015');
    expect(NETWORKS.futurenet.rpcUrl).toBe('https://rpc-futurenet.stellar.org');
  });

  it('applies environment overrides consistently', () => {
    process.env.STELLAR_HORIZON_URL = 'https://horizon.example.test';
    process.env.STELLAR_RPC_URL = 'https://rpc.example.test';
    process.env.STELLAR_NETWORK_PASSPHRASE = 'custom passphrase';

    expect(resolveNetwork('testnet')).toMatchObject({
      horizonUrl: 'https://horizon.example.test',
      rpcUrl: 'https://rpc.example.test',
      passphrase: 'custom passphrase',
      networkPassphrase: 'custom passphrase',
    });
  });
});
