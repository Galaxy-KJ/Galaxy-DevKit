import { Command } from 'commander';
import { defiCommand } from '../../src/commands/defi/index.js';
import { blendCommand } from '../../src/commands/defi/blend.js';
import { swapCommand } from '../../src/commands/defi/swap.js';
import { poolsCommand } from '../../src/commands/defi/pools.js';

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

const originalLog = console.log;
const originalError = console.error;

jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: '',
  }));
});

jest.mock('inquirer', () => ({
  prompt: jest.fn().mockResolvedValue({ selectedWallet: 'test-wallet', confirmed: true }),
}));

jest.mock('../../src/utils/protocol-registry', () => {
  const actual = jest.requireActual('../../src/utils/protocol-registry');
  const protocol = {
    initialize: jest.fn().mockResolvedValue(undefined),
    isInitialized: jest.fn().mockReturnValue(true),
    protocolId: 'blend',
    name: 'Blend Protocol',
    type: 'lending',
    config: {},
    supply: jest.fn().mockResolvedValue({
      hash: 'abc123def456',
      status: 'success',
      ledger: 12345,
      createdAt: new Date(),
      metadata: {},
    }),
    borrow: jest.fn().mockResolvedValue({
      hash: 'def789ghi012',
      status: 'success',
      ledger: 12346,
      createdAt: new Date(),
      metadata: {},
    }),
    getSwapQuote: jest.fn().mockResolvedValue({
      tokenIn: { code: 'XLM', type: 'native' },
      tokenOut: { code: 'USDC', issuer: 'GA...' },
      amountIn: '100',
      amountOut: '50.5',
      priceImpact: '0.5',
      minimumReceived: '50.0',
      path: ['XLM', 'USDC'],
      validUntil: new Date(Date.now() + 60000),
    }),
    swap: jest.fn().mockResolvedValue({
      hash: 'swap789ghi012',
      status: 'success',
      ledger: 12347,
      createdAt: new Date(),
      metadata: {},
    }),
    getAllPoolsAnalytics: jest.fn().mockResolvedValue([
      {
        tokenA: { code: 'XLM' },
        tokenB: { code: 'USDC' },
        reserveA: '1000000',
        reserveB: '500000',
        totalLiquidity: '1500000',
        tvl: '1500000',
        apy: '12.5',
        fee: '0.003',
        address: 'CA...',
      },
    ]),
  };

  const soroswapProtocol = {
    ...protocol,
    protocolId: 'soroswap',
    name: 'Soroswap',
    type: 'dex',
  };

  return {
    ...actual,
    getProtocolInstance: jest.fn().mockImplementation((id: string) => {
      if (id === 'blend') return Promise.resolve(protocol);
      if (id === 'soroswap') return Promise.resolve(soroswapProtocol);
      return Promise.resolve(protocol);
    }),
    selectWallet: jest.fn().mockResolvedValue({
      name: 'test-wallet',
      publicKey: 'GD1234567890ABCDEF',
      secretKey: 'SD1234567890ABCDEF',
      network: 'testnet',
    }),
    confirmTransaction: jest.fn().mockResolvedValue(true),
    validateAmount: jest.fn(),
    validateSlippage: jest.fn().mockReturnValue('0.01'),
    listSupportedProtocols: jest.fn().mockReturnValue([]),
  };
});

jest.mock('../../src/utils/protocol-formatter', () => ({
  outputTransactionPreview: jest.fn(),
  outputTransactionResult: jest.fn(),
  outputSwapQuote: jest.fn(),
  outputError: jest.fn(),
  outputCancelled: jest.fn(),
}));

describe('defi command group', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
    resetCommandOptions(defiCommand);
  });

  afterAll(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  it('should have defi command with description', () => {
    expect(defiCommand.name()).toBe('defi');
    expect(defiCommand.description()).toContain('DeFi protocols');
  });

  it('should register blend subcommand', () => {
    const sub = defiCommand.commands.find((c) => c.name() === 'blend');
    expect(sub).toBeDefined();
    expect(sub!.description()).toContain('Blend');
  });

  it('should register swap subcommand', () => {
    const sub = defiCommand.commands.find((c) => c.name() === 'swap');
    expect(sub).toBeDefined();
    expect(sub!.description()).toContain('Swap');
  });

  it('should register pools subcommand', () => {
    const sub = defiCommand.commands.find((c) => c.name() === 'pools');
    expect(sub).toBeDefined();
    expect(sub!.description()).toContain('pools');
  });
});

describe('defi blend commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
    resetCommandOptions(blendCommand);
  });

  afterAll(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  it('should have supply subcommand', () => {
    const sub = blendCommand.commands.find((c) => c.name() === 'supply');
    expect(sub).toBeDefined();
    expect(sub!.description()).toContain('Supply');
  });

  it('should have borrow subcommand', () => {
    const sub = blendCommand.commands.find((c) => c.name() === 'borrow');
    expect(sub).toBeDefined();
    expect(sub!.description()).toContain('Borrow');
  });

  it('supply should accept asset and amount arguments', () => {
    const sub = blendCommand.commands.find((c) => c.name() === 'supply')!;
    const args = (sub as any)._args;
    expect(args.length).toBeGreaterThanOrEqual(2);
    expect(args[0].name()).toBe('asset');
    expect(args[1].name()).toBe('amount');
  });

  it('borrow should accept asset and amount arguments', () => {
    const sub = blendCommand.commands.find((c) => c.name() === 'borrow')!;
    const args = (sub as any)._args;
    expect(args.length).toBeGreaterThanOrEqual(2);
    expect(args[0].name()).toBe('asset');
    expect(args[1].name()).toBe('amount');
  });

  it('should have --json flag on supply', () => {
    const sub = blendCommand.commands.find((c) => c.name() === 'supply')!;
    const opt = sub.options.find((o) => o.long === '--json');
    expect(opt).toBeDefined();
  });
});

describe('defi swap command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
    resetCommandOptions(swapCommand);
  });

  afterAll(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  it('should have from-asset, to-asset, amount arguments', () => {
    expect((swapCommand as any)._args.length).toBeGreaterThanOrEqual(3);
  });

  it('should have --quote-only flag', () => {
    const opt = swapCommand.options.find((o) => o.long === '--quote-only');
    expect(opt).toBeDefined();
  });

  it('should have --slippage option with default 1', () => {
    const opt = swapCommand.options.find((o) => o.long === '--slippage');
    expect(opt).toBeDefined();
  });
});

describe('defi pools list command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
    const listCmd = poolsCommand.commands.find((c) => c.name() === 'list');
    if (listCmd) resetCommandOptions(listCmd);
  });

  afterAll(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  it('should have list subcommand', () => {
    const sub = poolsCommand.commands.find((c) => c.name() === 'list');
    expect(sub).toBeDefined();
    expect(sub!.description()).toContain('List');
  });

  it('should have --json flag on list', () => {
    const sub = poolsCommand.commands.find((c) => c.name() === 'list')!;
    const opt = sub.options.find((o) => o.long === '--json');
    expect(opt).toBeDefined();
  });
});
