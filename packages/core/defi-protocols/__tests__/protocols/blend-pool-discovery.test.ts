import { Address, Asset, Contract, Keypair, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { PoolV2, TokenMetadata } from '@blend-capital/blend-sdk';
import { BlendProtocol } from '../../src/protocols/blend/blend-protocol.js';
import { BLEND_TESTNET_CONFIG } from '../../src/protocols/blend/blend-config.js';

jest.mock('@blend-capital/blend-sdk', () => ({
  PoolV2: { load: jest.fn() },
  TokenMetadata: { load: jest.fn() }
}));

class TestBlend extends BlendProtocol {
  protected async validateConfiguration(): Promise<void> {}
}

describe('Blend pool configuration and borrower discovery', () => {
  const poolAddress = BLEND_TESTNET_CONFIG.contractAddresses.pool;
  const assetAddress = Asset.native().contractId(BLEND_TESTNET_CONFIG.network.passphrase);
  const borrower = Keypair.random().publicKey();
  const healthy = Keypair.random().publicKey();
  const originalFetch = global.fetch;
  let pool: any;
  let getEvents: jest.SpyInstance;
  let getHealth: jest.SpyInstance;

  const create = (options = {}) => new TestBlend({ ...BLEND_TESTNET_CONFIG, ...options });
  const event = (name = 'borrow', user = borrower, ledger = 95): rpc.Api.EventResponse => ({
    id: `${ledger}-${user}`, type: 'contract', ledger,
    ledgerClosedAt: '', transactionIndex: 1, operationIndex: 1,
    inSuccessfulContractCall: true, txHash: '', contractId: new Contract(poolAddress),
    topic: [nativeToScVal(name, { type: 'symbol' }),
      new Address(assetAddress).toScVal(), new Address(user).toScVal()],
    value: nativeToScVal([1n, 1n])
  });
  const positions = (protocol: BlendProtocol) => jest.spyOn(protocol, 'getPosition')
    .mockImplementation(async address => ({
      address, supplied: [], borrowed: [], healthFactor: address === healthy ? '2' : '0.8',
      collateralValue: '80', debtValue: '100'
    }));

  beforeEach(() => {
    jest.useFakeTimers({ now: 100000 });
    pool = {
      metadata: { name: 'On-chain pool', oracle: 'on-chain-oracle',
        backstopRate: 2000000, reserveList: [assetAddress] },
      reserves: new Map([[assetAddress, {
        config: { c_factor: 7500000, l_factor: 8500000,
          r_base: 100000, r_one: 200000, r_two: 300000, r_three: 400000 },
        data: { interestRateModifier: 10000000n }, irmodDecimals: 7
      }]])
    };
    (PoolV2.load as jest.Mock).mockReset().mockResolvedValue(pool);
    (TokenMetadata.load as jest.Mock).mockReset().mockResolvedValue({
      symbol: 'XLM', asset: Asset.native()
    });
    getHealth = jest.spyOn(rpc.Server.prototype, 'getHealth').mockResolvedValue({
      latestLedger: 100, oldestLedger: 90, ledgerRetentionWindow: 11, status: 'healthy'
    });
    getEvents = jest.spyOn(rpc.Server.prototype, 'getEvents').mockResolvedValue({
      events: [], cursor: 'end', latestLedger: 100, oldestLedger: 90,
      latestLedgerCloseTime: '', oldestLedgerCloseTime: ''
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('initializes with on-chain metadata, reserves and the configured indexer', async () => {
    const protocol = create({ indexerUrl: 'https://indexer.example' });
    await protocol.initialize();
    expect(await protocol.getPoolConfig()).toEqual({
      poolAddress, name: 'On-chain pool', oracleAddress: 'on-chain-oracle',
      indexerUrl: 'https://indexer.example', assets: [{
        asset: { code: 'XLM', type: 'native' }, assetAddress,
        collateralFactor: '0.75', liquidationFactor: '0.85',
        reserveFactor: '0.2', maxBorrowRate: '0.1'
      }]
    });
    expect(PoolV2.load).toHaveBeenCalledWith({
      rpc: BLEND_TESTNET_CONFIG.network.sorobanRpcUrl,
      passphrase: BLEND_TESTNET_CONFIG.network.passphrase
    }, poolAddress);
  });

  it('caches until the TTL, shares concurrent refreshes and protects its cached snapshot', async () => {
    const protocol = create({ poolConfigTtlMs: 1000 });
    await protocol.initialize();
    (await protocol.getPoolConfig()).assets.length = 0;
    jest.advanceTimersByTime(999);
    expect((await protocol.getPoolConfig()).assets).toHaveLength(1);
    expect(PoolV2.load).toHaveBeenCalledTimes(1);
    pool.metadata.name = 'Updated pool';
    jest.advanceTimersByTime(1);
    const results = await Promise.all([protocol.getPoolConfig(), protocol.getPoolConfig()]);
    expect(results[0].name).toBe('Updated pool');
    expect(PoolV2.load).toHaveBeenCalledTimes(2);
  });

  it('maps discovered Stellar assets back to their reserve contract', async () => {
    const asset = new Asset('USDC', borrower);
    (TokenMetadata.load as jest.Mock).mockResolvedValue({ symbol: 'USDC', asset });
    pool.reserves.get(assetAddress).totalSupplyFloat = () => 42;
    const protocol = create();
    await protocol.initialize();
    const config = await protocol.getPoolConfig();
    expect(config.assets[0].asset).toEqual({ code: 'USDC', issuer: borrower, type: 'credit_alphanum4' });
    expect(await protocol.getTotalSupply(config.assets[0].asset)).toBe('42.0000000');
  });

  it('keeps custom token contract addresses when no Stellar asset exists', async () => {
    (TokenMetadata.load as jest.Mock).mockResolvedValue({ symbol: 'CUSTOM', asset: undefined });
    const protocol = create();
    await protocol.initialize();
    expect((await protocol.getPoolConfig()).assets[0].asset).toEqual({
      code: 'CUSTOM', type: 'credit_alphanum12', issuer: assetAddress
    });
  });

  it('rejects failed initialization and permits a retry', async () => {
    const protocol = create();
    (PoolV2.load as jest.Mock).mockRejectedValueOnce(new Error('RPC unavailable'));
    await expect(protocol.initialize()).rejects.toThrow('RPC unavailable');
    expect(protocol.isInitialized()).toBe(false);
    await protocol.initialize();
    expect((await protocol.getPoolConfig()).assets).toHaveLength(1);
  });

  it('rejects an incomplete reserve snapshot', async () => {
    pool.reserves.clear();
    await expect(create().initialize()).rejects.toThrow('Missing reserve data');
  });

  it('retries a failed refresh without caching the failure', async () => {
    const protocol = create({ poolConfigTtlMs: 1000 });
    await protocol.initialize();
    jest.advanceTimersByTime(1000);
    (PoolV2.load as jest.Mock).mockRejectedValueOnce(new Error('refresh failed'));
    await expect(protocol.getPoolConfig()).rejects.toThrow('refresh failed');
    expect((await protocol.getPoolConfig()).assets).toHaveLength(1);
    expect(PoolV2.load).toHaveBeenCalledTimes(3);
  });

  it('returns unhealthy indexed positions once per address without querying events', async () => {
    const protocol = create({ indexerUrl: 'https://indexer.example/' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true,
      json: async () => ({ users: [borrower, healthy, borrower] }) });
    await protocol.initialize();
    const getPosition = positions(protocol);
    expect(await protocol.findLiquidationOpportunities()).toEqual([
      expect.objectContaining({ userAddress: borrower, healthFactor: '0.8' })
    ]);
    expect(global.fetch).toHaveBeenCalledWith(`https://indexer.example/pools/${poolAddress}/positions`);
    expect(getPosition).toHaveBeenCalledTimes(2);
    expect(getHealth).not.toHaveBeenCalled();
  });

  it.each([
    { ok: false, status: 503 },
    { ok: true, json: async () => ({ positions: [] }) }
  ])('surfaces indexer failures instead of reporting no opportunities', async response => {
    const protocol = create({ indexerUrl: 'https://indexer.example' });
    global.fetch = jest.fn().mockResolvedValue(response);
    await protocol.initialize();
    await expect(protocol.findLiquidationOpportunities()).rejects.toThrow();
  });

  it('paginates events, clamps to retention and deduplicates borrow/collateral users', async () => {
    const protocol = create({ eventLookbackLedgers: 50 });
    getEvents.mockResolvedValueOnce({ events: [event(), event('supply_collateral')], cursor: 'page1' })
      .mockResolvedValueOnce({ events: [event('borrow', healthy), event('repay')], cursor: 'page2' });
    await protocol.initialize();
    const getPosition = positions(protocol);
    expect(await protocol.findLiquidationOpportunities()).toHaveLength(1);
    expect(getPosition).toHaveBeenCalledTimes(2);
    expect(getEvents.mock.calls[0][0]).toMatchObject({ startLedger: 90, endLedger: 101,
      filters: [{ type: 'contract', contractIds: [poolAddress] }] });
    expect(getEvents.mock.calls[1][0]).toMatchObject({ cursor: 'page1' });
    expect(getEvents.mock.calls[1][0]).not.toHaveProperty('startLedger');
    expect(getEvents.mock.calls[1][0]).not.toHaveProperty('endLedger');
  });

  it('bounds history and ignores failed, malformed, foreign and out-of-window events', async () => {
    const protocol = create({ eventLookbackLedgers: 5 });
    getEvents.mockResolvedValueOnce({ events: [
      event('borrow', borrower, 95),
      { ...event(), ledger: 96, inSuccessfulContractCall: false },
      { ...event(), ledger: 96, contractId: new Contract(assetAddress) },
      { ...event(), ledger: 96, topic: [nativeToScVal('borrow'), nativeToScVal(1), nativeToScVal(2)] },
      event('supply_collateral', borrower, 100), event('borrow', healthy, 101)
    ], cursor: 'next' });
    await protocol.initialize();
    const getPosition = positions(protocol);
    expect(await protocol.findLiquidationOpportunities()).toHaveLength(1);
    expect(getEvents.mock.calls[0][0].startLedger).toBe(96);
    expect(getPosition).toHaveBeenCalledTimes(1);
    expect(getPosition).toHaveBeenCalledWith(borrower);
  });

  it('does not stop mid-ledger and rejects non-advancing pagination', async () => {
    const protocol = create();
    getEvents.mockResolvedValue({ events: [event('borrow', borrower, 100)], cursor: 'same' });
    await protocol.initialize();
    await expect(protocol.findLiquidationOpportunities()).rejects.toThrow('cursor did not advance');
    expect(getEvents).toHaveBeenCalledTimes(2);
  });

  it('surfaces RPC failures', async () => {
    getEvents.mockRejectedValue(new Error('RPC unavailable'));
    const protocol = create();
    await protocol.initialize();
    await expect(protocol.findLiquidationOpportunities()).rejects.toThrow('RPC unavailable');
  });

  it('rejects scans exceeding the page budget', async () => {
    let page = 0;
    getEvents.mockImplementation(async () => ({ events: [event()], cursor: `page-${++page}` }));
    const protocol = create();
    await protocol.initialize();
    await expect(protocol.findLiquidationOpportunities()).rejects.toThrow('exceeded 100 pages');
    expect(getEvents).toHaveBeenCalledTimes(100);
  });

  it('continues after a failed position and excludes non-finite health factors', async () => {
    const protocol = create({ indexerUrl: 'https://indexer.example' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true,
      json: async () => ({ users: [healthy, borrower, assetAddress] }) });
    await protocol.initialize();
    positions(protocol).mockRejectedValueOnce(new Error('position failed'))
      .mockResolvedValueOnce({ address: borrower, supplied: [], borrowed: [],
        healthFactor: '∞', collateralValue: '0', debtValue: '0' });
    expect(await protocol.findLiquidationOpportunities()).toEqual([
      expect.objectContaining({ userAddress: assetAddress })
    ]);
  });

  it.each([0, -1, NaN, Infinity, 1.5])('rejects invalid cache and scan bounds: %s', value => {
    expect(() => create({ poolConfigTtlMs: value })).toThrow('positive safe integer');
    expect(() => create({ eventLookbackLedgers: value })).toThrow('positive safe integer');
  });
});
