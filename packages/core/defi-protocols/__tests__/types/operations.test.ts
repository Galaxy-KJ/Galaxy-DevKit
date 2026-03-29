/**
 * @fileoverview Tests for protocol operation types and type guards
 * @description Unit tests for operation type definitions and type guards
 */

import {
    OperationType,
    SupplyOperation,
    WithdrawOperation,
    BorrowOperation,
    RepayOperation,
    SwapOperation,
    AddLiquidityOperation,
    RemoveLiquidityOperation,
    ProtocolOperation
} from '../../src/types/operations.js';
import {
    isSupplyOperation,
    isWithdrawOperation,
    isBorrowOperation,
    isRepayOperation,
    isSwapOperation,
    isAddLiquidityOperation,
    isRemoveLiquidityOperation,
    isLendingOperation,
    isDexOperation,
    isAsset,
    isStellarAddress,
    isValidAmount,
    isOperationType,
    isProtocolOperation
} from '../../src/utils/type-guards.js';
import { Asset } from '../../src/types/defi-types.js';

describe('Operation Types', () => {
    const mockAsset: Asset = {
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        type: 'credit_alphanum4'
    };

    const nativeAsset: Asset = {
        code: 'XLM',
        type: 'native'
    };

    const baseOperationProps = {
        timestamp: new Date(),
        walletAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3SACD63Z2N3G'
    };

    describe('SupplyOperation', () => {
        const supplyOp: SupplyOperation = {
            type: OperationType.SUPPLY,
            ...baseOperationProps,
            asset: mockAsset,
            amount: '1000.0000000'
        };

        it('should create a valid supply operation', () => {
            expect(supplyOp.type).toBe(OperationType.SUPPLY);
            expect(supplyOp.asset.code).toBe('USDC');
            expect(supplyOp.amount).toBe('1000.0000000');
        });

        it('should be identified by type guard', () => {
            expect(isSupplyOperation(supplyOp)).toBe(true);
            expect(isWithdrawOperation(supplyOp)).toBe(false);
        });

        it('should be identified as lending operation', () => {
            expect(isLendingOperation(supplyOp)).toBe(true);
            expect(isDexOperation(supplyOp)).toBe(false);
        });
    });

    describe('WithdrawOperation', () => {
        const withdrawOp: WithdrawOperation = {
            type: OperationType.WITHDRAW,
            ...baseOperationProps,
            asset: mockAsset,
            amount: '500.0000000'
        };

        it('should create a valid withdraw operation', () => {
            expect(withdrawOp.type).toBe(OperationType.WITHDRAW);
        });

        it('should be identified by type guard', () => {
            expect(isWithdrawOperation(withdrawOp)).toBe(true);
            expect(isSupplyOperation(withdrawOp)).toBe(false);
        });
    });

    describe('BorrowOperation', () => {
        const borrowOp: BorrowOperation = {
            type: OperationType.BORROW,
            ...baseOperationProps,
            asset: mockAsset,
            amount: '250.0000000',
            collateralAsset: nativeAsset
        };

        it('should create a valid borrow operation with collateral', () => {
            expect(borrowOp.type).toBe(OperationType.BORROW);
            expect(borrowOp.collateralAsset?.code).toBe('XLM');
        });

        it('should be identified by type guard', () => {
            expect(isBorrowOperation(borrowOp)).toBe(true);
        });

        it('should be identified as lending operation', () => {
            expect(isLendingOperation(borrowOp)).toBe(true);
        });
    });

    describe('RepayOperation', () => {
        const repayOp: RepayOperation = {
            type: OperationType.REPAY,
            ...baseOperationProps,
            asset: mockAsset,
            amount: '100.0000000',
            repayAll: false
        };

        it('should create a valid repay operation', () => {
            expect(repayOp.type).toBe(OperationType.REPAY);
            expect(repayOp.repayAll).toBe(false);
        });

        it('should be identified by type guard', () => {
            expect(isRepayOperation(repayOp)).toBe(true);
        });
    });

    describe('SwapOperation', () => {
        const swapOp: SwapOperation = {
            type: OperationType.SWAP,
            ...baseOperationProps,
            tokenIn: nativeAsset,
            tokenOut: mockAsset,
            amountIn: '100.0000000',
            minAmountOut: '99.0000000',
            slippageTolerance: '0.01'
        };

        it('should create a valid swap operation', () => {
            expect(swapOp.type).toBe(OperationType.SWAP);
            expect(swapOp.tokenIn.code).toBe('XLM');
            expect(swapOp.tokenOut.code).toBe('USDC');
        });

        it('should be identified by type guard', () => {
            expect(isSwapOperation(swapOp)).toBe(true);
        });

        it('should be identified as DEX operation', () => {
            expect(isDexOperation(swapOp)).toBe(true);
            expect(isLendingOperation(swapOp)).toBe(false);
        });
    });

    describe('AddLiquidityOperation', () => {
        const addLiqOp: AddLiquidityOperation = {
            type: OperationType.ADD_LIQUIDITY,
            ...baseOperationProps,
            tokenA: nativeAsset,
            tokenB: mockAsset,
            amountA: '100.0000000',
            amountB: '500.0000000'
        };

        it('should create a valid add liquidity operation', () => {
            expect(addLiqOp.type).toBe(OperationType.ADD_LIQUIDITY);
        });

        it('should be identified by type guard', () => {
            expect(isAddLiquidityOperation(addLiqOp)).toBe(true);
        });

        it('should be identified as DEX operation', () => {
            expect(isDexOperation(addLiqOp)).toBe(true);
        });
    });

    describe('RemoveLiquidityOperation', () => {
        const removeLiqOp: RemoveLiquidityOperation = {
            type: OperationType.REMOVE_LIQUIDITY,
            ...baseOperationProps,
            poolAddress: 'CPOOL123456789',
            lpTokenAmount: '50.0000000'
        };

        it('should create a valid remove liquidity operation', () => {
            expect(removeLiqOp.type).toBe(OperationType.REMOVE_LIQUIDITY);
        });

        it('should be identified by type guard', () => {
            expect(isRemoveLiquidityOperation(removeLiqOp)).toBe(true);
        });
    });
});

describe('Type Guards', () => {
    describe('isAsset', () => {
        it('should return true for valid native asset', () => {
            expect(isAsset({ code: 'XLM', type: 'native' })).toBe(true);
        });

        it('should return true for valid credit asset', () => {
            expect(isAsset({
                code: 'USDC',
                issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
                type: 'credit_alphanum4'
            })).toBe(true);
        });

        it('should return false for credit asset without issuer', () => {
            expect(isAsset({ code: 'USDC', type: 'credit_alphanum4' })).toBe(false);
        });

        it('should return false for invalid type', () => {
            expect(isAsset({ code: 'XLM', type: 'invalid' })).toBe(false);
        });

        it('should return false for null', () => {
            expect(isAsset(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(isAsset(undefined)).toBe(false);
        });
    });

    describe('isStellarAddress', () => {
        it('should return true for valid Stellar address', () => {
            expect(isStellarAddress('GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3SACD63Z2N3G')).toBe(true);
        });

        it('should return false for invalid address', () => {
            expect(isStellarAddress('invalid')).toBe(false);
        });

        it('should return false for non-string', () => {
            expect(isStellarAddress(123)).toBe(false);
        });
    });

    describe('isValidAmount', () => {
        it('should return true for valid positive amount', () => {
            expect(isValidAmount('100.5')).toBe(true);
            expect(isValidAmount('0.0000001')).toBe(true);
        });

        it('should return false for negative amount', () => {
            expect(isValidAmount('-100')).toBe(false);
        });

        it('should return false for zero', () => {
            expect(isValidAmount('0')).toBe(false);
        });

        it('should return false for non-numeric string', () => {
            expect(isValidAmount('abc')).toBe(false);
        });
    });

    describe('isOperationType', () => {
        it('should return true for valid operation types', () => {
            expect(isOperationType(OperationType.SUPPLY)).toBe(true);
            expect(isOperationType(OperationType.SWAP)).toBe(true);
        });

        it('should return false for invalid operation type', () => {
            expect(isOperationType('invalid')).toBe(false);
        });
    });

    describe('isNativeAsset', () => {
        it('should return true for native asset', () => {
            expect(isNativeAsset({ code: 'XLM', type: 'native' })).toBe(true);
        });

        it('should return false for credit asset', () => {
            expect(isNativeAsset({
                code: 'USDC',
                issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
                type: 'credit_alphanum4'
            })).toBe(false);
        });
    });

    describe('isCreditAsset', () => {
        it('should return true for credit_alphanum4 asset', () => {
            expect(isCreditAsset({
                code: 'USDC',
                issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
                type: 'credit_alphanum4'
            })).toBe(true);
        });

        it('should return true for credit_alphanum12 asset', () => {
            expect(isCreditAsset({
                code: 'LONGASSETCODE',
                issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
                type: 'credit_alphanum12'
            })).toBe(true);
        });

        it('should return false for native asset', () => {
            expect(isCreditAsset({ code: 'XLM', type: 'native' })).toBe(false);
        });
    });

    describe('isBaseOperation', () => {
        it('should return true for valid base operation', () => {
            const op = {
                type: OperationType.SUPPLY,
                timestamp: new Date(),
                walletAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3SACD63Z2N3G'
            };
            expect(isBaseOperation(op)).toBe(true);
        });

        it('should return false for null', () => {
            expect(isBaseOperation(null)).toBe(false);
        });

        it('should return false for non-object', () => {
            expect(isBaseOperation('string')).toBe(false);
        });

        it('should return false for invalid type', () => {
            const op = {
                type: 'invalid',
                timestamp: new Date(),
                walletAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3SACD63Z2N3G'
            };
            expect(isBaseOperation(op)).toBe(false);
        });

        it('should return false for missing timestamp', () => {
            const op = {
                type: OperationType.SUPPLY,
                walletAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3SACD63Z2N3G'
            };
            expect(isBaseOperation(op)).toBe(false);
        });

        it('should return false for non-Date timestamp', () => {
            const op = {
                type: OperationType.SUPPLY,
                timestamp: 'not-a-date',
                walletAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3SACD63Z2N3G'
            };
            expect(isBaseOperation(op)).toBe(false);
        });

        it('should return false for missing walletAddress', () => {
            const op = {
                type: OperationType.SUPPLY,
                timestamp: new Date()
            };
            expect(isBaseOperation(op)).toBe(false);
        });
    });

    describe('isProtocolOperation', () => {
        const baseProps = {
            timestamp: new Date(),
            walletAddress: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3SACD63Z2N3G'
        };

        const validAsset = {
            code: 'USDC',
            issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            type: 'credit_alphanum4'
        };

        const nativeAsset = { code: 'XLM', type: 'native' };

        it('should return true for valid SupplyOperation', () => {
            const op = {
                type: OperationType.SUPPLY,
                ...baseProps,
                asset: validAsset,
                amount: '100.0000000'
            };
            expect(isProtocolOperation(op)).toBe(true);
        });

        it('should return true for valid WithdrawOperation', () => {
            const op = {
                type: OperationType.WITHDRAW,
                ...baseProps,
                asset: validAsset,
                amount: '100.0000000'
            };
            expect(isProtocolOperation(op)).toBe(true);
        });

        it('should return true for valid BorrowOperation', () => {
            const op = {
                type: OperationType.BORROW,
                ...baseProps,
                asset: validAsset,
                amount: '100.0000000'
            };
            expect(isProtocolOperation(op)).toBe(true);
        });

        it('should return true for valid RepayOperation', () => {
            const op = {
                type: OperationType.REPAY,
                ...baseProps,
                asset: validAsset,
                amount: '100.0000000'
            };
            expect(isProtocolOperation(op)).toBe(true);
        });

        it('should return true for valid SwapOperation', () => {
            const op = {
                type: OperationType.SWAP,
                ...baseProps,
                tokenIn: nativeAsset,
                tokenOut: validAsset,
                amountIn: '100.0000000',
                minAmountOut: '99.0000000'
            };
            expect(isProtocolOperation(op)).toBe(true);
        });

        it('should return true for valid AddLiquidityOperation', () => {
            const op = {
                type: OperationType.ADD_LIQUIDITY,
                ...baseProps,
                tokenA: nativeAsset,
                tokenB: validAsset,
                amountA: '100.0000000',
                amountB: '500.0000000'
            };
            expect(isProtocolOperation(op)).toBe(true);
        });

        it('should return true for valid RemoveLiquidityOperation', () => {
            const op = {
                type: OperationType.REMOVE_LIQUIDITY,
                ...baseProps,
                poolAddress: 'CPOOL123456789',
                lpTokenAmount: '50.0000000'
            };
            expect(isProtocolOperation(op)).toBe(true);
        });

        it('should return false for invalid base operation', () => {
            expect(isProtocolOperation(null)).toBe(false);
            expect(isProtocolOperation('string')).toBe(false);
        });

        it('should return false for SupplyOperation with invalid asset', () => {
            const op = {
                type: OperationType.SUPPLY,
                ...baseProps,
                asset: { code: 'USDC', type: 'invalid' },
                amount: '100.0000000'
            };
            expect(isProtocolOperation(op)).toBe(false);
        });

        it('should return false for SupplyOperation with invalid amount', () => {
            const op = {
                type: OperationType.SUPPLY,
                ...baseProps,
                asset: validAsset,
                amount: '-100'
            };
            expect(isProtocolOperation(op)).toBe(false);
        });

        it('should return false for SwapOperation with invalid tokenIn', () => {
            const op = {
                type: OperationType.SWAP,
                ...baseProps,
                tokenIn: { code: 'XLM', type: 'invalid' },
                tokenOut: validAsset,
                amountIn: '100.0000000',
                minAmountOut: '99.0000000'
            };
            expect(isProtocolOperation(op)).toBe(false);
        });

        it('should return false for RemoveLiquidityOperation with non-string poolAddress', () => {
            const op = {
                type: OperationType.REMOVE_LIQUIDITY,
                ...baseProps,
                poolAddress: 123,
                lpTokenAmount: '50.0000000'
            };
            expect(isProtocolOperation(op)).toBe(false);
        });

        it('should return false for RemoveLiquidityOperation with invalid lpTokenAmount', () => {
            const op = {
                type: OperationType.REMOVE_LIQUIDITY,
                ...baseProps,
                poolAddress: 'CPOOL123456789',
                lpTokenAmount: 'invalid'
            };
            expect(isProtocolOperation(op)).toBe(false);
        });
    });

    describe('isValidAmount edge cases', () => {
        it('should return false for non-string type', () => {
            expect(isValidAmount(100)).toBe(false);
            expect(isValidAmount(null)).toBe(false);
            expect(isValidAmount(undefined)).toBe(false);
        });
    });

    describe('isAsset edge cases', () => {
        it('should return false for object without code', () => {
            expect(isAsset({ type: 'native' })).toBe(false);
        });

        it('should return false for non-string code', () => {
            expect(isAsset({ code: 123, type: 'native' })).toBe(false);
        });
    });
});

import {
    isNativeAsset,
    isCreditAsset,
    isBaseOperation,
} from '../../src/utils/type-guards.js';

