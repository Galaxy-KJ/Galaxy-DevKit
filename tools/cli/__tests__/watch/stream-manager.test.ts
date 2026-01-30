/**
 * @fileoverview Tests for StreamManager
 * @description Unit tests for stream handling, reconnection, and timeout logic
 * @author Galaxy DevKit Team
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamManager, StreamOptions, RetryConfig } from '../../src/utils/stream-manager.js';
import { firstValueFrom, take, toArray, timeout } from 'rxjs';

// Mock the Stellar SDK
vi.mock('@stellar/stellar-sdk', () => {
    const mockStream = (callbacks: any) => {
        // Simulate receiving a message after a short delay
        setTimeout(() => {
            if (callbacks.onmessage) {
                callbacks.onmessage({ id: 'test-1', type: 'payment' });
            }
        }, 100);
        return () => { }; // Return close function
    };

    const mockServer = {
        loadAccount: vi.fn().mockResolvedValue({
            balances: [
                { asset_type: 'native', balance: '100.0000000' },
            ],
        }),
        payments: vi.fn().mockReturnValue({
            forAccount: vi.fn().mockReturnValue({
                cursor: vi.fn().mockReturnValue({
                    stream: mockStream,
                }),
            }),
        }),
        transactions: vi.fn().mockReturnValue({
            forAccount: vi.fn().mockReturnValue({
                cursor: vi.fn().mockReturnValue({
                    stream: mockStream,
                }),
            }),
            transaction: vi.fn().mockReturnValue({
                call: vi.fn().mockResolvedValue({
                    hash: 'test-hash',
                    ledger_attr: 12345,
                    successful: true,
                    created_at: '2024-01-01T00:00:00Z',
                }),
            }),
            cursor: vi.fn().mockReturnValue({
                stream: mockStream,
            }),
        }),
        ledgers: vi.fn().mockReturnValue({
            cursor: vi.fn().mockReturnValue({
                stream: mockStream,
            }),
        }),
    };

    return {
        Horizon: {
            Server: vi.fn().mockImplementation(function () {
                return mockServer;
            }),
        },
    };
});

describe('StreamManager', () => {
    let streamManager: StreamManager;

    beforeEach(() => {
        vi.clearAllMocks();
        streamManager = new StreamManager({ network: 'testnet' });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should create instance with testnet config', () => {
            const manager = new StreamManager({ network: 'testnet' });
            expect(manager).toBeDefined();
            expect(manager.getServer()).toBeDefined();
        });

        it('should create instance with mainnet config', () => {
            const manager = new StreamManager({ network: 'mainnet' });
            expect(manager).toBeDefined();
        });

        it('should use custom horizon URL when provided', () => {
            const customUrl = 'https://custom-horizon.example.com';
            const manager = new StreamManager({
                network: 'testnet',
                horizonUrl: customUrl,
            });
            expect(manager).toBeDefined();
        });
    });

    describe('loadAccount', () => {
        it('should load account successfully', async () => {
            const account = await streamManager.loadAccount('GTEST123');
            expect(account).toBeDefined();
            expect(account.balances).toBeDefined();
            expect(account.balances.length).toBeGreaterThan(0);
        });

        it('should trim whitespace from address', async () => {
            const account = await streamManager.loadAccount('  GTEST123  ');
            expect(account).toBeDefined();
        });
    });

    describe('watchAccountPayments', () => {
        it('should return an Observable', () => {
            const observable = streamManager.watchAccountPayments('GTEST123');
            expect(observable).toBeDefined();
            expect(typeof observable.subscribe).toBe('function');
        });

        it('should emit payment records', async () => {
            const observable = streamManager.watchAccountPayments('GTEST123');
            const result = await firstValueFrom(observable.pipe(take(1)));
            expect(result).toBeDefined();
        });
    });

    describe('watchTransaction', () => {
        it('should return transaction when found', async () => {
            const observable = streamManager.watchTransaction('test-hash');
            const result = await firstValueFrom(observable);
            expect(result).toBeDefined();
            expect(result.hash).toBe('test-hash');
            expect(result.successful).toBe(true);
        });

        it('should accept custom timeout', () => {
            const observable = streamManager.watchTransaction('test-hash', 30000);
            expect(observable).toBeDefined();
        });
    });

    describe('watchLedgers', () => {
        it('should return an Observable', () => {
            const observable = streamManager.watchLedgers();
            expect(observable).toBeDefined();
            expect(typeof observable.subscribe).toBe('function');
        });
    });

    describe('watchAllTransactions', () => {
        it('should return an Observable for all transactions', () => {
            const observable = streamManager.watchAllTransactions();
            expect(observable).toBeDefined();
            expect(typeof observable.subscribe).toBe('function');
        });
    });

    describe('retry configuration', () => {
        it('should have default retry config', () => {
            const config = streamManager.getRetryConfig();
            expect(config.maxAttempts).toBe(3);
            expect(config.delayMs).toBe(1000);
            expect(config.backoffMultiplier).toBe(2);
        });

        it('should allow updating retry config', () => {
            streamManager.setRetryConfig({ maxAttempts: 5, delayMs: 2000 });
            const config = streamManager.getRetryConfig();
            expect(config.maxAttempts).toBe(5);
            expect(config.delayMs).toBe(2000);
        });
    });

    describe('getRpcUrl', () => {
        it('should return testnet RPC URL for testnet', () => {
            const manager = new StreamManager({ network: 'testnet' });
            expect(manager.getRpcUrl()).toContain('testnet');
        });

        it('should return mainnet RPC URL for mainnet', () => {
            const manager = new StreamManager({ network: 'mainnet' });
            expect(manager.getRpcUrl()).toContain('mainnet');
        });

        it('should use custom RPC URL when provided', () => {
            const customRpc = 'https://custom-rpc.example.com';
            const manager = new StreamManager({
                network: 'testnet',
                rpcUrl: customRpc,
            });
            expect(manager.getRpcUrl()).toBe(customRpc);
        });
    });
});
