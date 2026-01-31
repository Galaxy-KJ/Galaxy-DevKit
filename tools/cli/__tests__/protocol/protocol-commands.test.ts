/**
 * @fileoverview Tests for protocol commands
 * @description Unit tests for the protocol interaction CLI commands
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-30
 */

import { listCommand } from '../../src/commands/protocol/list';
import { infoCommand } from '../../src/commands/protocol/info';
import { connectCommand } from '../../src/commands/protocol/connect';
import { blendCommand } from '../../src/commands/protocol/blend';
import { swapCommand } from '../../src/commands/protocol/swap';
import { liquidityCommand } from '../../src/commands/protocol/liquidity';

// Save original console methods
const originalLog = console.log;
const originalError = console.error;

// Mock ora spinner
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: '',
  }));
});

// Mock inquirer
jest.mock('inquirer', () => ({
  prompt: jest.fn().mockResolvedValue({ selectedWallet: 'test-wallet', confirmed: true }),
}));

// Mock the protocol factory
const mockProtocol = {
  initialize: jest.fn().mockResolvedValue(undefined),
  isInitialized: jest.fn().mockReturnValue(true),
  protocolId: 'blend',
  name: 'Blend Protocol',
  type: 'lending',
  config: {},
  getStats: jest.fn().mockResolvedValue({
    totalSupply: '1000000',
    totalBorrow: '500000',
    tvl: '1500000',
    utilizationRate: 50,
    timestamp: new Date(),
  }),
  supply: jest.fn().mockResolvedValue({
    hash: 'abc123def456',
    status: 'success',
    ledger: 12345,
    createdAt: new Date(),
    metadata: {},
  }),
  withdraw: jest.fn().mockResolvedValue({
    hash: 'xyz789',
    status: 'success',
    ledger: 12346,
    createdAt: new Date(),
    metadata: {},
  }),
  borrow: jest.fn().mockResolvedValue({
    hash: 'bor123',
    status: 'success',
    ledger: 12347,
    createdAt: new Date(),
    metadata: {},
  }),
  repay: jest.fn().mockResolvedValue({
    hash: 'rep456',
    status: 'success',
    ledger: 12348,
    createdAt: new Date(),
    metadata: {},
  }),
  getPosition: jest.fn().mockResolvedValue({
    address: 'GTEST123',
    supplied: [],
    borrowed: [],
    healthFactor: '1.5',
    collateralValue: '1000',
    debtValue: '500',
  }),
  getHealthFactor: jest.fn().mockResolvedValue({
    value: '1.5',
    liquidationThreshold: '0.8',
    maxLTV: '0.75',
    isHealthy: true,
  }),
  getSupplyAPY: jest.fn().mockResolvedValue({
    supplyAPY: '5.0',
    borrowAPY: '8.0',
    timestamp: new Date(),
  }),
  getBorrowAPY: jest.fn().mockResolvedValue({
    supplyAPY: '5.0',
    borrowAPY: '8.0',
    timestamp: new Date(),
  }),
  getTotalSupply: jest.fn().mockResolvedValue('1000000'),
  getTotalBorrow: jest.fn().mockResolvedValue('500000'),
  swap: jest.fn().mockResolvedValue({
    hash: 'swap123',
    status: 'success',
    ledger: 12349,
    createdAt: new Date(),
    metadata: {},
  }),
  getSwapQuote: jest.fn().mockResolvedValue({
    tokenIn: { code: 'XLM', type: 'native' },
    tokenOut: { code: 'USDC', type: 'credit_alphanum4' },
    amountIn: '100',
    amountOut: '12',
    priceImpact: '0.5',
    minimumReceived: '11.88',
    path: ['XLM', 'USDC'],
    validUntil: new Date(Date.now() + 300000),
  }),
  addLiquidity: jest.fn().mockResolvedValue({
    hash: 'liq123',
    status: 'success',
    ledger: 12350,
    createdAt: new Date(),
    metadata: {},
  }),
  removeLiquidity: jest.fn().mockResolvedValue({
    hash: 'rem123',
    status: 'success',
    ledger: 12351,
    createdAt: new Date(),
    metadata: {},
  }),
  getLiquidityPool: jest.fn().mockResolvedValue({
    address: 'POOL123',
    tokenA: { code: 'XLM', type: 'native' },
    tokenB: { code: 'USDC', type: 'credit_alphanum4' },
    reserveA: '10000',
    reserveB: '1200',
    totalLiquidity: '5000',
    fee: '0.003',
  }),
};

// Mock the protocol registry
jest.mock('../../src/utils/protocol-registry', () => ({
  ...jest.requireActual('../../src/utils/protocol-registry'),
  getProtocolInstance: jest.fn().mockResolvedValue(mockProtocol),
  selectWallet: jest.fn().mockResolvedValue({
    name: 'test-wallet',
    publicKey: 'GTEST123456789',
    secretKey: 'STEST123456789',
    network: 'testnet',
  }),
  confirmTransaction: jest.fn().mockResolvedValue(true),
}));

// Mock wallet storage
jest.mock('../../src/utils/wallet-storage', () => ({
  walletStorage: {
    listWallets: jest.fn().mockResolvedValue([
      { name: 'test-wallet', publicKey: 'GTEST123456789', network: 'testnet' },
    ]),
    loadWallet: jest.fn().mockResolvedValue({
      publicKey: 'GTEST123456789',
      secretKey: 'STEST123456789',
      network: 'testnet',
      createdAt: new Date().toISOString(),
    }),
  },
  WalletStorage: jest.fn(),
}));

describe('protocol commands', () => {
  beforeEach(() => {
    console.log = jest.fn();
    console.error = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  describe('list command', () => {
    it('outputs protocol list as JSON', async () => {
      await listCommand.parseAsync(['node', 'list', '--json']);
      expect(console.log).toHaveBeenCalled();
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.protocols).toBeDefined();
      expect(parsed.protocols.length).toBeGreaterThan(0);
    });

    it('filters protocols by network', async () => {
      await listCommand.parseAsync(['node', 'list', '--network', 'testnet', '--json']);
      expect(console.log).toHaveBeenCalled();
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.network).toBe('testnet');
    });

    it('returns supported protocols including blend and soroswap', async () => {
      await listCommand.parseAsync(['node', 'list', '--json']);
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      const protocolIds = parsed.protocols.map((p: any) => p.id);
      expect(protocolIds).toContain('blend');
      expect(protocolIds).toContain('soroswap');
    });
  });

  describe('info command', () => {
    it('outputs protocol info as JSON', async () => {
      await infoCommand.parseAsync(['node', 'info', 'blend', '--json']);
      expect(console.log).toHaveBeenCalled();
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.id).toBe('blend');
      expect(parsed.name).toBe('Blend Protocol');
    });

    it('includes protocol type and capabilities', async () => {
      await infoCommand.parseAsync(['node', 'info', 'blend', '--json']);
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.type).toBeDefined();
      expect(parsed.capabilities).toBeDefined();
    });
  });

  describe('connect command', () => {
    it('reports successful connection as JSON', async () => {
      await connectCommand.parseAsync(['node', 'connect', 'blend', '--json']);
      expect(console.log).toHaveBeenCalled();
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.connected).toBe(true);
      expect(parsed.protocol).toBe('blend');
    });

    it('includes network in connection result', async () => {
      await connectCommand.parseAsync(['node', 'connect', 'blend', '--network', 'testnet', '--json']);
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.network).toBe('testnet');
    });
  });

  describe('swap quote command', () => {
    it('returns swap quote as JSON', async () => {
      await swapCommand.parseAsync(['node', 'swap', 'quote', 'XLM', 'USDC', '100', '--json']);
      expect(console.log).toHaveBeenCalled();
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.tokenIn).toBeDefined();
      expect(parsed.tokenOut).toBeDefined();
      expect(parsed.amountIn).toBe('100');
      expect(parsed.amountOut).toBeDefined();
    });

    it('includes price impact in quote', async () => {
      await swapCommand.parseAsync(['node', 'swap', 'quote', 'XLM', 'USDC', '100', '--json']);
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.priceImpact).toBeDefined();
    });
  });
});

describe('protocol registry', () => {
  const {
    listSupportedProtocols,
    getProtocolInfo,
    validateAmount,
    validateSlippage,
    getExplorerUrl,
  } = jest.requireActual('../../src/utils/protocol-registry');

  it('lists all supported protocols', () => {
    const protocols = listSupportedProtocols();
    expect(protocols.length).toBeGreaterThan(0);
    expect(protocols.find((p: any) => p.id === 'blend')).toBeDefined();
    expect(protocols.find((p: any) => p.id === 'soroswap')).toBeDefined();
  });

  it('filters protocols by network', () => {
    const testnetProtocols = listSupportedProtocols('testnet');
    testnetProtocols.forEach((p: any) => {
      expect(p.networks).toContain('testnet');
    });
  });

  it('returns protocol info by id', () => {
    const blend = getProtocolInfo('blend');
    expect(blend).toBeDefined();
    expect(blend.name).toBe('Blend Protocol');
  });

  it('returns undefined for unknown protocol', () => {
    const unknown = getProtocolInfo('unknown-protocol');
    expect(unknown).toBeUndefined();
  });

  it('validates positive amounts', () => {
    expect(() => validateAmount('100', 'Amount')).not.toThrow();
    expect(() => validateAmount('0.001', 'Amount')).not.toThrow();
  });

  it('rejects invalid amounts', () => {
    expect(() => validateAmount('0', 'Amount')).toThrow();
    expect(() => validateAmount('-10', 'Amount')).toThrow();
    expect(() => validateAmount('abc', 'Amount')).toThrow();
  });

  it('validates slippage percentage', () => {
    expect(validateSlippage('1')).toBe('0.01');
    expect(validateSlippage('0.5')).toBe('0.005');
    expect(validateSlippage('10')).toBe('0.1');
  });

  it('rejects invalid slippage', () => {
    expect(() => validateSlippage('-1')).toThrow();
    expect(() => validateSlippage('101')).toThrow();
    expect(() => validateSlippage('abc')).toThrow();
  });

  it('generates correct explorer URLs', () => {
    const testnetUrl = getExplorerUrl('abc123', 'testnet');
    expect(testnetUrl).toContain('testnet');
    expect(testnetUrl).toContain('abc123');

    const mainnetUrl = getExplorerUrl('xyz789', 'mainnet');
    expect(mainnetUrl).toContain('public');
    expect(mainnetUrl).toContain('xyz789');
  });
});

describe('protocol formatter', () => {
  const {
    outputProtocolList,
    outputTransactionResult,
    outputSwapQuote,
  } = jest.requireActual('../../src/utils/protocol-formatter');

  beforeEach(() => {
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('outputs protocol list as JSON', () => {
    const protocols = [
      {
        id: 'blend',
        name: 'Blend Protocol',
        type: 'lending',
        description: 'Lending protocol',
        networks: ['testnet', 'mainnet'],
        capabilities: ['lending', 'borrowing'],
      },
    ];

    outputProtocolList(protocols, { json: true });
    expect(console.log).toHaveBeenCalled();
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.protocols[0].id).toBe('blend');
  });

  it('outputs transaction result as JSON', () => {
    const result = {
      hash: 'tx123',
      status: 'success' as const,
      ledger: 12345,
      createdAt: new Date(),
      metadata: {},
    };

    outputTransactionResult(result, { json: true, network: 'testnet' });
    expect(console.log).toHaveBeenCalled();
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.hash).toBe('tx123');
    expect(parsed.status).toBe('success');
    expect(parsed.explorerUrl).toContain('testnet');
  });

  it('outputs swap quote as JSON', () => {
    const quote = {
      tokenIn: { code: 'XLM', type: 'native' as const },
      tokenOut: { code: 'USDC', type: 'credit_alphanum4' as const },
      amountIn: '100',
      amountOut: '12',
      priceImpact: '0.5',
      minimumReceived: '11.88',
      path: ['XLM', 'USDC'],
      validUntil: new Date(),
    };

    outputSwapQuote(quote, { json: true });
    expect(console.log).toHaveBeenCalled();
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.amountIn).toBe('100');
    expect(parsed.amountOut).toBe('12');
  });
});
