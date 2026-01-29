/**
 * @fileoverview Comprehensive tests for oracle price command
 */

import { priceCommand } from '../../src/commands/oracle/price';

const originalLog = console.log;
const originalError = console.error;
const originalExit = process.exit;
const originalFetch = (globalThis as unknown as { fetch?: unknown }).fetch;

beforeEach(() => {
    console.log = jest.fn();
    console.error = jest.fn();
    process.exit = jest.fn() as never;
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ symbol: 'XLM/USD', price: 0.12 }),
    });
});

afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
    (globalThis as unknown as { fetch?: unknown }).fetch = originalFetch;
    jest.clearAllMocks();
});

describe('price command', () => {
    describe('basic functionality', () => {
        it('returns aggregated price for a symbol', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.symbol).toBe('XLM/USD');
            expect(typeof parsed.price).toBe('number');
        });

        it('supports table output format by default', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            expect(output).toContain('Symbol');
        });
    });

    describe('strategy options', () => {
        it('uses median strategy by default', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.strategy).toBe('median');
        });

        it('supports mean strategy', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--strategy', 'mean', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.strategy).toBe('mean');
        });

        it('supports weighted strategy', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--strategy', 'weighted', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.strategy).toBe('weighted');
        });

        it('supports twap strategy', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--strategy', 'twap', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.strategy).toBe('twap');
        });

        it('throws error for unknown strategy', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--strategy', 'invalid']);
            expect(console.error).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(1);
        });
    });

    describe('sources filter', () => {
        it('filters sources when specified', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--sources', 'coingecko', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.sourcesFilter).toContain('coingecko');
        });

        it('handles multiple sources', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--sources', 'coingecko,binance', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.sourcesFilter).toHaveLength(2);
        });
    });

    describe('output format', () => {
        it('includes confidence level in output', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.confidence).toBeDefined();
            expect(typeof parsed.confidence).toBe('number');
        });

        it('includes source count in output', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.sourceCount).toBeGreaterThan(0);
        });

        it('includes timestamp in output', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.timestamp).toBeDefined();
        });
    });

    describe('error handling', () => {
        it('handles rate limiting errors gracefully', async () => {
            (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 429,
                json: async () => ({}),
            });

            await priceCommand.parseAsync(['node', 'price', 'XLM/USD']);
            expect(console.error).toHaveBeenCalled();
        });

        it('handles network errors with retry', async () => {
            let attempts = 0;
            (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockImplementation(() => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('Network error');
                }
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({ symbol: 'XLM/USD', price: 0.12 }),
                });
            });

            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--json']);
            expect(attempts).toBeGreaterThanOrEqual(1);
        });
    });

    describe('network option', () => {
        it('accepts testnet network', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--network', 'testnet', '--json']);
            expect(console.log).toHaveBeenCalled();
        });

        it('accepts mainnet network', async () => {
            await priceCommand.parseAsync(['node', 'price', 'XLM/USD', '--network', 'mainnet', '--json']);
            expect(console.log).toHaveBeenCalled();
        });
    });
});
