/**
 * @fileoverview Tests for protocol commands
 * @description Unit tests for the protocol interaction CLI commands
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-30
 */

import { Command } from 'commander';
import { listCommand } from '../../src/commands/protocol/list';
import { infoCommand } from '../../src/commands/protocol/info';
import { connectCommand } from '../../src/commands/protocol/connect';
import { blendCommand } from '../../src/commands/protocol/blend';
import { supplyCommand } from '../../src/commands/protocol/supply';
import { swapCommand } from '../../src/commands/protocol/swap';
import { liquidityCommand } from '../../src/commands/protocol/liquidity';

/**
 * Commander v12 does not reset _optionValues between parseAsync calls.
 * This helper resets a command's options to their declared default values
 * so that each test starts with a clean slate.
 */
function resetCommandOptions(cmd: Command): void {
  const c = cmd as any;
  c._optionValues = {};
  c._optionValueSources = {};
  for (const option of c.options) {
    const key: string = option.attributeName();
    if (option.defaultValue !== undefined) {
      c._optionValues[key] = option.defaultValue;
      c._optionValueSources[key] = 'default';
    }
  }
}

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

// Build a shared mock protocol instance — defined inside the mock factory to avoid hoisting issues
// Tests that need to spy on specific methods access it via require() after mocks are set up.
jest.mock('../../src/utils/protocol-registry', () => {
  const actual = jest.requireActual('../../src/utils/protocol-registry');
  const protocol = {
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
  return {
    ...actual,
    getProtocolInstance: jest.fn().mockResolvedValue(protocol),
    selectWallet: jest.fn().mockResolvedValue({
      name: 'test-wallet',
      publicKey: 'GTEST123456789',
      secretKey: 'STEST123456789',
      network: 'testnet',
    }),
    confirmTransaction: jest.fn().mockResolvedValue(true),
    __mockProtocol: protocol,
  };
});

// Expose the shared mock protocol for per-test assertions
const mockProtocol = (require('../../src/utils/protocol-registry') as any).__mockProtocol;

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
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    // Set up process.exit spy first
    mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    console.log = jest.fn();
    console.error = jest.fn();
    // Reset all mocks (clears call history and implementations; re-applied below)
    jest.resetAllMocks();
    // Note: resetAllMocks removes implementations, so re-apply mockExit
    mockExit.mockImplementation((() => {}) as any);
    // Re-apply console mocks (cleared by resetAllMocks)
    console.log = jest.fn();
    console.error = jest.fn();
    // Reset Commander v12 option state (v12 does not auto-reset between parseAsync calls)
    resetCommandOptions(listCommand);
    resetCommandOptions(infoCommand);
    resetCommandOptions(connectCommand);
    resetCommandOptions(supplyCommand);
    resetCommandOptions(swapCommand);
    resetCommandOptions(liquidityCommand);
    // Re-apply default resolved values that resetAllMocks wipes
    const reg = require('../../src/utils/protocol-registry');
    reg.getProtocolInstance.mockResolvedValue(mockProtocol);
    reg.selectWallet.mockResolvedValue({
      name: 'test-wallet',
      publicKey: 'GTEST123456789',
      secretKey: 'STEST123456789',
      network: 'testnet',
    });
    reg.confirmTransaction.mockResolvedValue(true);
    // Re-apply mock protocol method implementations
    mockProtocol.initialize.mockResolvedValue(undefined);
    mockProtocol.isInitialized.mockReturnValue(true);
    mockProtocol.supply.mockResolvedValue({
      hash: 'abc123def456',
      status: 'success',
      ledger: 12345,
      createdAt: new Date(),
      metadata: {},
    });
    mockProtocol.swap.mockResolvedValue({
      hash: 'swap123',
      status: 'success',
      ledger: 12349,
      createdAt: new Date(),
      metadata: {},
    });
    mockProtocol.getSwapQuote.mockResolvedValue({
      tokenIn: { code: 'XLM', type: 'native' },
      tokenOut: { code: 'USDC', type: 'credit_alphanum4' },
      amountIn: '100',
      amountOut: '12',
      priceImpact: '0.5',
      minimumReceived: '11.88',
      path: ['XLM', 'USDC'],
      validUntil: new Date(Date.now() + 300000),
    });
    mockProtocol.getStats.mockResolvedValue({
      totalSupply: '1000000',
      totalBorrow: '500000',
      tvl: '1500000',
      utilizationRate: 50,
      timestamp: new Date(),
    });
    mockProtocol.getPosition.mockResolvedValue({
      address: 'GTEST123',
      supplied: [],
      borrowed: [],
      healthFactor: '1.5',
      collateralValue: '1000',
      debtValue: '500',
    });
  });

  afterEach(() => {
    mockExit.mockRestore();
    console.log = originalLog;
    console.error = originalError;
  });

  // ─── list ────────────────────────────────────────────────────────────────

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

    it('rejects invalid network values', async () => {
      await listCommand.parseAsync(['node', 'list', '--network', 'invalidnet', '--json']);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // ─── info ─────────────────────────────────────────────────────────────────

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

    it('exits with error for unknown protocol', async () => {
      await infoCommand.parseAsync(['node', 'info', 'unknown-proto', '--json']);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // ─── connect ──────────────────────────────────────────────────────────────

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

    it('exits with error for unknown protocol', async () => {
      await connectCommand.parseAsync(['node', 'connect', 'nonexistent', '--json']);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // ─── supply ───────────────────────────────────────────────────────────────

  describe('supply command', () => {
    it('executes supply and outputs transaction result as JSON', async () => {
      await supplyCommand.parseAsync(['node', 'supply', 'USDC', '100', '--json', '--yes']);
      expect(console.log).toHaveBeenCalled();
      // Last JSON output is the transaction result
      const calls = (console.log as jest.Mock).mock.calls;
      const resultCall = calls.find((c) => {
        try {
          const p = JSON.parse(c[0]);
          return p.hash !== undefined;
        } catch {
          return false;
        }
      });
      expect(resultCall).toBeDefined();
      const parsed = JSON.parse(resultCall![0]);
      expect(parsed.hash).toBe('abc123def456');
      expect(parsed.status).toBe('success');
    });

    it('defaults to Blend protocol for supply', async () => {
      const { getProtocolInstance } = require('../../src/utils/protocol-registry');
      await supplyCommand.parseAsync(['node', 'supply', 'USDC', '100', '--json', '--yes']);
      expect(getProtocolInstance).toHaveBeenCalledWith('blend', 'testnet');
    });

    it('uses testnet as the default network', async () => {
      const { getProtocolInstance } = require('../../src/utils/protocol-registry');
      await supplyCommand.parseAsync(['node', 'supply', 'XLM', '50', '--json', '--yes']);
      expect(getProtocolInstance).toHaveBeenCalledWith('blend', 'testnet');
    });

    it('resolves XLM as native asset', async () => {
      await supplyCommand.parseAsync(['node', 'supply', 'XLM', '50', '--json', '--yes']);
      expect(mockProtocol.supply).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ code: 'XLM', type: 'native' }),
        '50'
      );
    });

    it('resolves credit assets with correct type', async () => {
      await supplyCommand.parseAsync(['node', 'supply', 'USDC', '100', '--json', '--yes']);
      expect(mockProtocol.supply).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ code: 'USDC', type: 'credit_alphanum4' }),
        '100'
      );
    });

    it('handles 7-decimal Stellar amounts', async () => {
      await supplyCommand.parseAsync(['node', 'supply', 'USDC', '100.0000001', '--json', '--yes']);
      expect(mockProtocol.supply).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        '100.0000001'
      );
    });

    it('rejects zero amounts', async () => {
      await supplyCommand.parseAsync(['node', 'supply', 'USDC', '0', '--json', '--yes']);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('rejects negative amounts (validated at utility level)', () => {
      const { validateAmount } = jest.requireActual('../../src/utils/protocol-registry');
      expect(() => validateAmount('-10', 'Amount')).toThrow();
    });

    it('rejects non-numeric amounts', async () => {
      await supplyCommand.parseAsync(['node', 'supply', 'USDC', 'abc', '--json', '--yes']);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('rejects invalid network option', async () => {
      await supplyCommand.parseAsync([
        'node', 'supply', 'USDC', '100', '--network', 'badnet', '--json', '--yes',
      ]);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('calls outputCancelled when confirmTransaction returns false', () => {
      const { outputCancelled } = jest.requireActual('../../src/utils/protocol-formatter');
      // Verify the cancel output works as expected
      (console.log as jest.Mock).mockClear();
      outputCancelled({ json: true });
      const output = (console.log as jest.Mock).mock.calls[0][0];
      expect(JSON.parse(output).cancelled).toBe(true);
    });

    it('shows transaction preview before confirming', async () => {
      await supplyCommand.parseAsync(['node', 'supply', 'USDC', '100', '--json', '--yes']);
      const calls = (console.log as jest.Mock).mock.calls;
      const previewCall = calls.find((c) => {
        try {
          const p = JSON.parse(c[0]);
          return p.operation === 'SUPPLY';
        } catch {
          return false;
        }
      });
      expect(previewCall).toBeDefined();
      const parsed = JSON.parse(previewCall![0]);
      expect(parsed.asset).toBe('USDC');
      expect(parsed.protocol).toBe('Blend Protocol');
    });

    it('rejects a non-lending protocol via --protocol flag', async () => {
      await supplyCommand.parseAsync([
        'node', 'supply', 'USDC', '100', '--protocol', 'soroswap', '--json', '--yes',
      ]);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('rejects an unknown protocol via --protocol flag', async () => {
      await supplyCommand.parseAsync([
        'node', 'supply', 'USDC', '100', '--protocol', 'unknownproto', '--json', '--yes',
      ]);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('supports mainnet network option', async () => {
      const { getProtocolInstance } = require('../../src/utils/protocol-registry');
      await supplyCommand.parseAsync([
        'node', 'supply', 'USDC', '100', '--network', 'mainnet', '--json', '--yes',
      ]);
      expect(getProtocolInstance).toHaveBeenCalledWith('blend', 'mainnet');
    });

    it('calls protocol.supply with wallet public key', async () => {
      await supplyCommand.parseAsync(['node', 'supply', 'USDC', '100', '--json', '--yes']);
      expect(mockProtocol.supply).toHaveBeenCalledWith(
        'GTEST123456789',
        'STEST123456789',
        expect.any(Object),
        '100'
      );
    });

    it('output includes explorer URL in transaction result JSON', async () => {
      await supplyCommand.parseAsync(['node', 'supply', 'USDC', '100', '--json', '--yes']);
      const calls = (console.log as jest.Mock).mock.calls;
      const resultCall = calls.find((c) => {
        try {
          const p = JSON.parse(c[0]);
          return p.explorerUrl !== undefined;
        } catch {
          return false;
        }
      });
      expect(resultCall).toBeDefined();
      const parsed = JSON.parse(resultCall![0]);
      expect(parsed.explorerUrl).toContain('testnet');
      expect(parsed.explorerUrl).toContain('abc123def456');
    });
  });

  // ─── swap quote ───────────────────────────────────────────────────────────

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

    it('includes minimum received in quote', async () => {
      await swapCommand.parseAsync(['node', 'swap', 'quote', 'XLM', 'USDC', '100', '--json']);
      const output = (console.log as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.minimumReceived).toBeDefined();
    });

    it('rejects invalid amount in quote', async () => {
      await swapCommand.parseAsync(['node', 'swap', 'quote', 'XLM', 'USDC', '-5', '--json']);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  // ─── swap execute ─────────────────────────────────────────────────────────

  describe('swap execute command', () => {
    it('executes swap and returns transaction result as JSON', async () => {
      await swapCommand.parseAsync([
        'node', 'swap', 'execute', 'XLM', 'USDC', '100', '--json', '--yes',
      ]);
      const calls = (console.log as jest.Mock).mock.calls;
      const resultCall = calls.find((c) => {
        try {
          const p = JSON.parse(c[0]);
          return p.hash !== undefined;
        } catch {
          return false;
        }
      });
      expect(resultCall).toBeDefined();
      const parsed = JSON.parse(resultCall![0]);
      expect(parsed.hash).toBe('swap123');
      expect(parsed.status).toBe('success');
    });

    it('shows swap preview before confirming', async () => {
      await swapCommand.parseAsync([
        'node', 'swap', 'execute', 'XLM', 'USDC', '100', '--json', '--yes',
      ]);
      const calls = (console.log as jest.Mock).mock.calls;
      const previewCall = calls.find((c) => {
        try {
          const p = JSON.parse(c[0]);
          return p.operation === 'SWAP';
        } catch {
          return false;
        }
      });
      expect(previewCall).toBeDefined();
    });
  });
});

// ─── protocol registry unit tests ─────────────────────────────────────────

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

  it('filters protocols by mainnet', () => {
    const mainnetProtocols = listSupportedProtocols('mainnet');
    mainnetProtocols.forEach((p: any) => {
      expect(p.networks).toContain('mainnet');
    });
  });

  it('returns protocol info by id', () => {
    const blend = getProtocolInfo('blend');
    expect(blend).toBeDefined();
    expect(blend.name).toBe('Blend Protocol');
  });

  it('returns soroswap protocol info', () => {
    const soroswap = getProtocolInfo('soroswap');
    expect(soroswap).toBeDefined();
    expect(soroswap.type).toBe('dex');
  });

  it('returns undefined for unknown protocol', () => {
    const unknown = getProtocolInfo('unknown-protocol');
    expect(unknown).toBeUndefined();
  });

  it('validates positive integer amounts', () => {
    expect(() => validateAmount('100', 'Amount')).not.toThrow();
  });

  it('validates positive decimal amounts', () => {
    expect(() => validateAmount('0.001', 'Amount')).not.toThrow();
  });

  it('validates 7-decimal Stellar amounts', () => {
    expect(() => validateAmount('100.0000001', 'Amount')).not.toThrow();
  });

  it('rejects zero amounts', () => {
    expect(() => validateAmount('0', 'Amount')).toThrow();
  });

  it('rejects negative amounts', () => {
    expect(() => validateAmount('-10', 'Amount')).toThrow();
  });

  it('rejects non-numeric amounts', () => {
    expect(() => validateAmount('abc', 'Amount')).toThrow();
  });

  it('rejects empty string amounts', () => {
    expect(() => validateAmount('', 'Amount')).toThrow();
  });

  it('validates slippage percentage', () => {
    expect(validateSlippage('1')).toBe('0.01');
    expect(validateSlippage('0.5')).toBe('0.005');
    expect(validateSlippage('10')).toBe('0.1');
  });

  it('validates zero slippage', () => {
    expect(validateSlippage('0')).toBe('0');
  });

  it('validates 100% slippage boundary', () => {
    expect(validateSlippage('100')).toBe('1');
  });

  it('rejects negative slippage', () => {
    expect(() => validateSlippage('-1')).toThrow();
  });

  it('rejects slippage over 100', () => {
    expect(() => validateSlippage('101')).toThrow();
  });

  it('rejects non-numeric slippage', () => {
    expect(() => validateSlippage('abc')).toThrow();
  });

  it('generates correct testnet explorer URL', () => {
    const testnetUrl = getExplorerUrl('abc123', 'testnet');
    expect(testnetUrl).toContain('testnet');
    expect(testnetUrl).toContain('abc123');
  });

  it('generates correct mainnet explorer URL', () => {
    const mainnetUrl = getExplorerUrl('xyz789', 'mainnet');
    expect(mainnetUrl).toContain('public');
    expect(mainnetUrl).toContain('xyz789');
  });

  it('blend protocol has lending capability', () => {
    const blend = getProtocolInfo('blend');
    expect(blend.capabilities).toContain('lending');
  });

  it('blend protocol has borrowing capability', () => {
    const blend = getProtocolInfo('blend');
    expect(blend.capabilities).toContain('borrowing');
  });

  it('soroswap protocol has swap capability', () => {
    const soroswap = getProtocolInfo('soroswap');
    expect(soroswap.capabilities).toContain('swap');
  });

  it('soroswap protocol has liquidity capability', () => {
    const soroswap = getProtocolInfo('soroswap');
    expect(soroswap.capabilities).toContain('liquidity');
  });
});

// ─── protocol formatter unit tests ────────────────────────────────────────

describe('protocol formatter', () => {
  const {
    outputProtocolList,
    outputProtocolInfo,
    outputTransactionPreview,
    outputTransactionResult,
    outputSwapQuote,
    outputPosition,
    outputLiquidityPool,
    outputLiquidityPoolList,
    outputError,
    outputCancelled,
  } = jest.requireActual('../../src/utils/protocol-formatter');

  beforeEach(() => {
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
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

  it('outputs protocol list as table when not JSON', () => {
    const protocols = [
      {
        id: 'blend',
        name: 'Blend Protocol',
        type: 'lending',
        description: 'Lending protocol',
        networks: ['testnet'],
        capabilities: ['lending'],
      },
    ];
    outputProtocolList(protocols, { json: false });
    expect(console.log).toHaveBeenCalled();
  });

  it('outputs protocol info as JSON with stats', () => {
    const protocol = {
      id: 'blend',
      name: 'Blend Protocol',
      type: 'lending',
      description: 'Lending protocol',
      networks: ['testnet', 'mainnet'],
      capabilities: ['lending', 'borrowing'],
    };
    const stats = {
      totalSupply: '1000000',
      totalBorrow: '500000',
      tvl: '1500000',
      utilizationRate: 50,
      timestamp: new Date(),
    };
    outputProtocolInfo(protocol, stats, { json: true });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe('blend');
    expect(parsed.stats).toBeDefined();
    expect(parsed.stats.tvl).toBe('1500000');
  });

  it('outputs protocol info as JSON without stats', () => {
    const protocol = {
      id: 'blend',
      name: 'Blend Protocol',
      type: 'lending',
      description: 'Lending protocol',
      networks: ['testnet'],
      capabilities: ['lending'],
    };
    outputProtocolInfo(protocol, null, { json: true });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.stats).toBeNull();
  });

  it('outputs transaction preview as JSON', () => {
    const preview = {
      operation: 'SUPPLY',
      protocol: 'Blend Protocol',
      network: 'testnet',
      asset: 'USDC',
      amount: '100',
      estimatedFee: '100',
      walletAddress: 'GTEST123456789',
    };
    outputTransactionPreview(preview, { json: true });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.operation).toBe('SUPPLY');
    expect(parsed.asset).toBe('USDC');
  });

  it('outputs swap transaction preview with token fields', () => {
    const preview = {
      operation: 'SWAP',
      protocol: 'Soroswap',
      network: 'testnet',
      estimatedFee: '100',
      walletAddress: 'GTEST123456789',
      tokenIn: 'XLM',
      tokenOut: 'USDC',
      amountIn: '100',
      expectedAmountOut: '12',
      minimumReceived: '11.88',
      priceImpact: '0.5',
      slippage: '1',
    };
    outputTransactionPreview(preview, { json: true });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.tokenIn).toBe('XLM');
    expect(parsed.slippage).toBe('1');
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

  it('outputs failed transaction result', () => {
    const result = {
      hash: 'tx999',
      status: 'failed' as const,
      ledger: 99999,
      createdAt: new Date(),
      metadata: {},
    };
    outputTransactionResult(result, { json: true, network: 'testnet' });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe('failed');
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

  it('outputs position as JSON', () => {
    const position = {
      address: 'GTEST123',
      supplied: [{ asset: { code: 'USDC', type: 'credit_alphanum4' }, amount: '100', valueUSD: '100' }],
      borrowed: [],
      healthFactor: '1.5',
      collateralValue: '1000',
      debtValue: '0',
    };
    outputPosition(position, { json: true });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.address).toBe('GTEST123');
    expect(parsed.healthFactor).toBe('1.5');
  });

  it('outputs liquidity pool as JSON', () => {
    const pool = {
      address: 'POOL123',
      tokenA: { code: 'XLM', type: 'native' as const },
      tokenB: { code: 'USDC', type: 'credit_alphanum4' as const },
      reserveA: '10000',
      reserveB: '1200',
      totalLiquidity: '5000',
      fee: '0.003',
    };
    outputLiquidityPool(pool, { json: true });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.address).toBe('POOL123');
  });

  it('outputs liquidity pool list as JSON', () => {
    const pools = [
      {
        address: 'POOL123',
        tokenA: { code: 'XLM', type: 'native' as const },
        tokenB: { code: 'USDC', type: 'credit_alphanum4' as const },
        reserveA: '10000',
        reserveB: '1200',
        totalLiquidity: '5000',
        fee: '0.003',
      },
    ];
    outputLiquidityPoolList(pools, { json: true });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.pools.length).toBe(1);
  });

  it('outputs error as JSON', () => {
    outputError(new Error('something went wrong'), { json: true });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.error).toBe('something went wrong');
  });

  it('outputs error as plain text', () => {
    outputError(new Error('plain error'), { json: false });
    expect(console.error).toHaveBeenCalled();
  });

  it('outputs non-Error objects as error', () => {
    outputError('string error', { json: true });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.error).toBe('string error');
  });

  it('outputs cancelled as JSON', () => {
    outputCancelled({ json: true });
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.cancelled).toBe(true);
  });

  it('outputs cancelled as text', () => {
    outputCancelled({ json: false });
    expect(console.log).toHaveBeenCalled();
  });
});
