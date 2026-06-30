import { ProtocolPool } from '../protocol-pool';

const createProtocol = jest.fn().mockImplementation((cfg: { protocolId: string }) => ({
  __id: cfg.protocolId,
}));

jest.mock('@galaxy-kj/core-defi-protocols', () => ({
  getProtocolFactory: () => ({ createProtocol }),
}));

describe('ProtocolPool', () => {
  beforeEach(() => createProtocol.mockClear());

  it('builds a protocol client lazily per (protocol, network)', () => {
    const pool = new ProtocolPool();
    const a = pool.get('blend', 'testnet');
    const b = pool.get('blend', 'testnet');

    expect(a).toBe(b);
    expect(createProtocol).toHaveBeenCalledTimes(1);
  });

  it('builds separate clients per network', () => {
    const pool = new ProtocolPool();
    pool.get('blend', 'testnet');
    pool.get('blend', 'mainnet');

    expect(createProtocol).toHaveBeenCalledTimes(2);
    const [testnetCall, mainnetCall] = createProtocol.mock.calls;
    expect(testnetCall[0].network.network).toBe('testnet');
    expect(mainnetCall[0].network.network).toBe('mainnet');
  });

  it('passes Blend contract addresses to the factory', () => {
    const pool = new ProtocolPool();
    pool.get('blend', 'testnet');
    expect(createProtocol).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolId: 'blend',
        contractAddresses: expect.objectContaining({ pool: expect.any(String) }),
      })
    );
  });
});
