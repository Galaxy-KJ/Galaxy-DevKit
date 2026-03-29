/**
 * @fileoverview Tests for custom error classes
 * @description Unit tests for protocol error handling
 */

import {
    ProtocolError,
    ProtocolErrorCode,
    ProtocolInitError,
    InsufficientBalanceError,
    InvalidOperationError,
    ContractError,
    SlippageExceededError,
    HealthFactorError,
    isProtocolError,
    wrapError
} from '../../src/errors/errors.js';

describe('ProtocolError', () => {
    describe('base class', () => {
        it('should create error with message and default code', () => {
            const error = new ProtocolError('Test error');
            expect(error.message).toBe('Test error');
            expect(error.code).toBe(ProtocolErrorCode.UNKNOWN_ERROR);
            expect(error.name).toBe('ProtocolError');
        });

        it('should create error with custom code', () => {
            const error = new ProtocolError('Init failed', ProtocolErrorCode.INIT_FAILED);
            expect(error.code).toBe(ProtocolErrorCode.INIT_FAILED);
        });

        it('should include protocol ID', () => {
            const error = new ProtocolError('Failed', ProtocolErrorCode.NETWORK_ERROR, {
                protocolId: 'blend'
            });
            expect(error.protocolId).toBe('blend');
        });

        it('should include cause', () => {
            const cause = new Error('Original error');
            const error = new ProtocolError('Wrapped', ProtocolErrorCode.UNKNOWN_ERROR, { cause });
            expect(error.cause).toBe(cause);
        });

        it('should include context', () => {
            const error = new ProtocolError('Failed', ProtocolErrorCode.UNKNOWN_ERROR, {
                context: { key: 'value' }
            });
            expect(error.context).toEqual({ key: 'value' });
        });

        it('should set timestamp', () => {
            const before = new Date();
            const error = new ProtocolError('Test');
            const after = new Date();
            expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
        });

        it('should serialize to JSON', () => {
            const error = new ProtocolError('Test error', ProtocolErrorCode.INIT_FAILED, {
                protocolId: 'test-protocol',
                context: { extra: 'data' }
            });
            const json = error.toJSON();
            expect(json.name).toBe('ProtocolError');
            expect(json.message).toBe('Test error');
            expect(json.code).toBe(ProtocolErrorCode.INIT_FAILED);
            expect(json.protocolId).toBe('test-protocol');
        });
    });
});

describe('ProtocolInitError', () => {
    it('should set correct name and code', () => {
        const error = new ProtocolInitError('Failed to initialize');
        expect(error.name).toBe('ProtocolInitError');
        expect(error.code).toBe(ProtocolErrorCode.INIT_FAILED);
    });

    it('should include protocol ID', () => {
        const error = new ProtocolInitError('Failed', { protocolId: 'soroswap' });
        expect(error.protocolId).toBe('soroswap');
    });
});

describe('InsufficientBalanceError', () => {
    it('should set correct name and code', () => {
        const error = new InsufficientBalanceError('Not enough balance');
        expect(error.name).toBe('InsufficientBalanceError');
        expect(error.code).toBe(ProtocolErrorCode.INSUFFICIENT_BALANCE);
    });

    it('should include balance details', () => {
        const error = new InsufficientBalanceError('Not enough USDC', {
            asset: 'USDC',
            required: '1000',
            available: '500'
        });
        expect(error.asset).toBe('USDC');
        expect(error.required).toBe('1000');
        expect(error.available).toBe('500');
    });
});

describe('InvalidOperationError', () => {
    it('should set correct name and code', () => {
        const error = new InvalidOperationError('Cannot borrow');
        expect(error.name).toBe('InvalidOperationError');
        expect(error.code).toBe(ProtocolErrorCode.INVALID_OPERATION);
    });

    it('should include operation details', () => {
        const error = new InvalidOperationError('Invalid swap', {
            operationType: 'swap',
            reason: 'Pool not found'
        });
        expect(error.operationType).toBe('swap');
        expect(error.reason).toBe('Pool not found');
    });
});

describe('ContractError', () => {
    it('should set correct name and code', () => {
        const error = new ContractError('Contract call failed');
        expect(error.name).toBe('ContractError');
        expect(error.code).toBe(ProtocolErrorCode.CONTRACT_EXECUTION_FAILED);
    });

    it('should include contract details', () => {
        const error = new ContractError('Execution failed', {
            contractAddress: 'CCONTRACT123',
            method: 'supply',
            transactionHash: 'abc123'
        });
        expect(error.contractAddress).toBe('CCONTRACT123');
        expect(error.method).toBe('supply');
        expect(error.transactionHash).toBe('abc123');
    });
});

describe('SlippageExceededError', () => {
    it('should set correct name and code', () => {
        const error = new SlippageExceededError('Slippage exceeded');
        expect(error.name).toBe('SlippageExceededError');
        expect(error.code).toBe(ProtocolErrorCode.SLIPPAGE_EXCEEDED);
    });

    it('should include slippage details', () => {
        const error = new SlippageExceededError('Slippage too high', {
            expectedAmount: '100',
            actualAmount: '90',
            tolerance: '0.05'
        });
        expect(error.expectedAmount).toBe('100');
        expect(error.actualAmount).toBe('90');
        expect(error.tolerance).toBe('0.05');
    });
});

describe('HealthFactorError', () => {
    it('should set correct name and code', () => {
        const error = new HealthFactorError('Health factor too low');
        expect(error.name).toBe('HealthFactorError');
        expect(error.code).toBe(ProtocolErrorCode.HEALTH_FACTOR_TOO_LOW);
    });

    it('should include health factor details', () => {
        const error = new HealthFactorError('Risk of liquidation', {
            currentHealthFactor: '1.5',
            projectedHealthFactor: '0.9',
            minimumRequired: '1.0'
        });
        expect(error.currentHealthFactor).toBe('1.5');
        expect(error.projectedHealthFactor).toBe('0.9');
        expect(error.minimumRequired).toBe('1.0');
    });
});

describe('isProtocolError', () => {
    it('should return true for ProtocolError', () => {
        expect(isProtocolError(new ProtocolError('Test'))).toBe(true);
    });

    it('should return true for subclasses', () => {
        expect(isProtocolError(new ProtocolInitError('Test'))).toBe(true);
        expect(isProtocolError(new InsufficientBalanceError('Test'))).toBe(true);
        expect(isProtocolError(new ContractError('Test'))).toBe(true);
    });

    it('should return false for standard Error', () => {
        expect(isProtocolError(new Error('Test'))).toBe(false);
    });

    it('should return false for non-error', () => {
        expect(isProtocolError('string')).toBe(false);
        expect(isProtocolError(null)).toBe(false);
    });
});

describe('wrapError', () => {
    it('should return ProtocolError as-is', () => {
        const original = new ProtocolError('Test');
        expect(wrapError(original)).toBe(original);
    });

    it('should wrap standard Error', () => {
        const original = new Error('Original message');
        const wrapped = wrapError(original, 'blend');
        expect(wrapped).toBeInstanceOf(ProtocolError);
        expect(wrapped.message).toBe('Original message');
        expect(wrapped.protocolId).toBe('blend');
        expect(wrapped.cause).toBe(original);
    });

    it('should wrap string', () => {
        const wrapped = wrapError('String error');
        expect(wrapped).toBeInstanceOf(ProtocolError);
        expect(wrapped.message).toBe('String error');
    });
});
