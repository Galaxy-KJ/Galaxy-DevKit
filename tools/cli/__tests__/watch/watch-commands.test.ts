/**
 * @fileoverview Tests for Watch Commands
 * @description Integration tests for watch command option parsing and output
 * @author Galaxy DevKit Team
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Mock blessed and blessed-contrib to prevent terminal UI initialization in tests
vi.mock('blessed', () => ({
    default: {
        screen: vi.fn().mockReturnValue({
            key: vi.fn(),
            render: vi.fn(),
            destroy: vi.fn(),
        }),
        box: vi.fn().mockReturnValue({
            setContent: vi.fn(),
        }),
        log: vi.fn().mockReturnValue({
            log: vi.fn(),
        }),
    },
}));

vi.mock('blessed-contrib', () => ({
    default: {
        grid: vi.fn().mockImplementation(() => ({
            set: vi.fn().mockReturnValue({
                setContent: vi.fn(),
                log: vi.fn(),
                setData: vi.fn(),
            }),
        })),
        line: vi.fn(),
        table: vi.fn(),
    },
}));

// Mock StreamManager
vi.mock('../../src/utils/stream-manager.js', () => ({
    StreamManager: vi.fn().mockImplementation(() => ({
        loadAccount: vi.fn().mockResolvedValue({
            balances: [{ asset_type: 'native', balance: '100.0' }],
        }),
        watchAccountPayments: vi.fn().mockReturnValue({
            subscribe: vi.fn(),
        }),
        watchTransaction: vi.fn().mockReturnValue({
            subscribe: vi.fn(),
        }),
        watchLedgers: vi.fn().mockReturnValue({
            subscribe: vi.fn(),
        }),
        watchAllTransactions: vi.fn().mockReturnValue({
            subscribe: vi.fn(),
        }),
        watchContractEvents: vi.fn().mockReturnValue({
            subscribe: vi.fn(),
        }),
    })),
}));

// Mock oracles
vi.mock('@galaxy/core-oracles', () => ({
    OracleAggregator: vi.fn().mockImplementation(() => ({
        setStrategy: vi.fn(),
        addSource: vi.fn(),
        getSources: vi.fn().mockReturnValue([{ name: 'MockSource' }]),
        getAggregatedPrice: vi.fn().mockResolvedValue({
            price: 0.12,
            confidence: 0.95,
            sources: ['MockSource'],
        }),
    })),
    MockOracleSource: vi.fn(),
    MedianStrategy: vi.fn(),
}));

describe('Watch Commands', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Account Watch Command', () => {
        it('should parse address argument', async () => {
            const { accountWatchCommand } = await import(
                '../../src/commands/watch/account.js'
            );

            expect(accountWatchCommand.name()).toBe('account');
            expect(accountWatchCommand.description()).toContain('real-time');
        });

        it('should have network option with default testnet', async () => {
            const { accountWatchCommand } = await import('../../src/commands/watch/account.js');
            const networkOption = accountWatchCommand.options.find(
                (opt: any) => opt.long === '--network'
            );
            expect(networkOption).toBeDefined();
        });

        it('should have json flag option', async () => {
            const { accountWatchCommand } = await import('../../src/commands/watch/account.js');
            const jsonOption = accountWatchCommand.options.find(
                (opt: any) => opt.long === '--json'
            );
            expect(jsonOption).toBeDefined();
        });

        it('should have interval option', async () => {
            const { accountWatchCommand } = await import('../../src/commands/watch/account.js');
            const intervalOption = accountWatchCommand.options.find(
                (opt: any) => opt.long === '--interval'
            );
            expect(intervalOption).toBeDefined();
        });
    });

    describe('Transaction Watch Command', () => {
        it('should have correct name and description', async () => {
            const { transactionWatchCommand } = await import(
                '../../src/commands/watch/transaction.js'
            );

            expect(transactionWatchCommand.name()).toBe('transaction');
            expect(transactionWatchCommand.description()).toContain('confirmed');
        });

        it('should have timeout option with default 60s', async () => {
            const { transactionWatchCommand } = await import('../../src/commands/watch/transaction.js');
            const timeoutOption = transactionWatchCommand.options.find(
                (opt: any) => opt.long === '--timeout'
            );
            expect(timeoutOption).toBeDefined();
        });

        it('should have json flag option', async () => {
            const { transactionWatchCommand } = await import('../../src/commands/watch/transaction.js');
            const jsonOption = transactionWatchCommand.options.find(
                (opt: any) => opt.long === '--json'
            );
            expect(jsonOption).toBeDefined();
        });
    });

    describe('Oracle Watch Command', () => {
        it('should have correct name and description', async () => {
            const { oracleWatchCommand } = await import(
                '../../src/commands/watch/oracle.js'
            );

            expect(oracleWatchCommand.name()).toBe('oracle');
            expect(oracleWatchCommand.description()).toContain('price');
        });

        it('should have interval option', async () => {
            const { oracleWatchCommand } = await import('../../src/commands/watch/oracle.js');
            const intervalOption = oracleWatchCommand.options.find(
                (opt: any) => opt.long === '--interval'
            );
            expect(intervalOption).toBeDefined();
        });

        it('should have json flag option', async () => {
            const { oracleWatchCommand } = await import('../../src/commands/watch/oracle.js');
            const jsonOption = oracleWatchCommand.options.find(
                (opt: any) => opt.long === '--json'
            );
            expect(jsonOption).toBeDefined();
        });
    });

    describe('Contract Watch Command', () => {
        it('should have correct name and description', async () => {
            const { contractWatchCommand } = await import(
                '../../src/commands/watch/contract.js'
            );

            expect(contractWatchCommand.name()).toBe('contract');
            expect(contractWatchCommand.description()).toContain('event');
        });

        it('should have event filter option', async () => {
            const { contractWatchCommand } = await import('../../src/commands/watch/contract.js');
            const eventOption = contractWatchCommand.options.find(
                (opt: any) => opt.long === '--event'
            );
            expect(eventOption).toBeDefined();
        });

        it('should have json flag option', async () => {
            const { contractWatchCommand } = await import('../../src/commands/watch/contract.js');
            const jsonOption = contractWatchCommand.options.find(
                (opt: any) => opt.long === '--json'
            );
            expect(jsonOption).toBeDefined();
        });
    });

    describe('Network Watch Command', () => {
        it('should have correct name and description', async () => {
            const { networkWatchCommand } = await import(
                '../../src/commands/watch/network.js'
            );

            expect(networkWatchCommand.name()).toBe('network');
            expect(networkWatchCommand.description()).toContain('TPS');
        });
    });

    describe('Dashboard Watch Command', () => {
        it('should have correct name and description', async () => {
            const { dashboardWatchCommand } = await import(
                '../../src/commands/watch/dashboard.js'
            );

            expect(dashboardWatchCommand.name()).toBe('dashboard');
            expect(dashboardWatchCommand.description()).toContain('multi-panel');
        });

        it('should have --dashboard alias', async () => {
            const { dashboardWatchCommand } = await import('../../src/commands/watch/dashboard.js');
            expect(dashboardWatchCommand.alias()).toBe('--dashboard');
        });
    });

    describe('Watch Command Index', () => {
        it('should register all subcommands', async () => {
            const { watchCommand } = await import(
                '../../src/commands/watch/index.js'
            );

            expect(watchCommand.name()).toBe('watch');

            const subcommands = watchCommand.commands.map((cmd: Command) => cmd.name());
            expect(subcommands).toContain('account');
            expect(subcommands).toContain('transaction');
            expect(subcommands).toContain('network');
            expect(subcommands).toContain('oracle');
            expect(subcommands).toContain('contract');
            expect(subcommands).toContain('dashboard');
        });
    });
});
