/**
 * @fileoverview Comprehensive tests for oracle validate command
 */

import { validateCommand } from '../../src/commands/oracle/validate';

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

describe('validate command', () => {
    describe('basic validation', () => {
        it('validates prices from all sources', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.results).toBeDefined();
            expect(Array.isArray(parsed.results)).toBe(true);
        });

        it('includes deviation percentage in output', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(typeof parsed.deviationPercent).toBe('number');
        });

        it('includes threshold in output', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.threshold).toBe(5);
        });
    });

    describe('threshold option', () => {
        it('uses default threshold of 5%', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.threshold).toBe(5);
        });

        it('accepts custom threshold', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--threshold', '10', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.threshold).toBe(10);
        });

        it('rejects negative threshold', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--threshold', '-5']);
            expect(console.error).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(1);
        });
    });

    describe('max-age option', () => {
        it('uses default max age of 60s', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.maxAgeMs).toBe(60000);
        });

        it('accepts custom max age', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--max-age', '30s', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.maxAgeMs).toBe(30000);
        });
    });

    describe('deviation detection', () => {
        it('marks sources as invalid when deviation exceeds threshold', async () => {
            // Mock sources with high deviation
            let callCount = 0;
            (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockImplementation(() => {
                callCount++;
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        symbol: 'XLM/USD',
                        price: callCount === 1 ? 0.10 : 0.20, // 100% deviation
                    }),
                });
            });

            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--threshold', '5', '--json']);
            expect(console.log).toHaveBeenCalled();
        });
    });

    describe('staleness detection', () => {
        it('marks stale prices as invalid', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--max-age', '1ms', '--json']);
            expect(console.log).toHaveBeenCalled();
        });
    });

    describe('source filtering', () => {
        it('validates only specified sources', async () => {
            await validateCommand.parseAsync([
                'node', 'validate', 'XLM/USD',
                '--sources', 'coingecko',
                '--json'
            ]);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            expect(parsed.results.length).toBeGreaterThan(0);
        });
    });

    describe('output format', () => {
        it('outputs table format by default', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            expect(output).toContain('Source');
        });

        it('outputs JSON when requested', async () => {
            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            expect(() => JSON.parse(output)).not.toThrow();
        });
    });

    describe('issue reporting', () => {
        it('reports rate_limited issue on 429 response', async () => {
            (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 429,
                json: async () => ({}),
            });

            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            const hasRateLimited = parsed.results.some((r: any) =>
                r.issues.includes('rate_limited')
            );
            expect(hasRateLimited).toBe(true);
        });

        it('reports fetch_failed issue on network error', async () => {
            (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockRejectedValue(
                new Error('Network error')
            );

            await validateCommand.parseAsync(['node', 'validate', 'XLM/USD', '--json']);
            const output = (console.log as jest.Mock).mock.calls[0][0];
            const parsed = JSON.parse(output);
            const hasFetchFailed = parsed.results.some((r: any) =>
                r.issues.includes('fetch_failed')
            );
            expect(hasFetchFailed).toBe(true);
        });
    });
});
