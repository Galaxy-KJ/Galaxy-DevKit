/**
 * @fileoverview Type guards for protocol operations
 * @description Runtime type checking utilities for discriminated union types
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import {
    ProtocolOperation,
    OperationType,
    SupplyOperation,
    WithdrawOperation,
    BorrowOperation,
    RepayOperation,
    SwapOperation,
    AddLiquidityOperation,
    RemoveLiquidityOperation,
    BaseOperation
} from '../types/operations.js';
import { Asset, AssetType } from '../types/defi-types.js';

// ============================================
// Operation Type Guards
// ============================================

/**
 * Check if an operation is a SupplyOperation
 * @param {ProtocolOperation} operation - Operation to check
 * @returns {boolean} True if operation is a SupplyOperation
 * @example
 * ```typescript
 * if (isSupplyOperation(op)) {
 *   console.log('Supplying', op.amount, 'of', op.asset.code);
 * }
 * ```
 */
export function isSupplyOperation(operation: ProtocolOperation): operation is SupplyOperation {
    return operation.type === OperationType.SUPPLY;
}

/**
 * Check if an operation is a WithdrawOperation
 * @param {ProtocolOperation} operation - Operation to check
 * @returns {boolean} True if operation is a WithdrawOperation
 */
export function isWithdrawOperation(operation: ProtocolOperation): operation is WithdrawOperation {
    return operation.type === OperationType.WITHDRAW;
}

/**
 * Check if an operation is a BorrowOperation
 * @param {ProtocolOperation} operation - Operation to check
 * @returns {boolean} True if operation is a BorrowOperation
 */
export function isBorrowOperation(operation: ProtocolOperation): operation is BorrowOperation {
    return operation.type === OperationType.BORROW;
}

/**
 * Check if an operation is a RepayOperation
 * @param {ProtocolOperation} operation - Operation to check
 * @returns {boolean} True if operation is a RepayOperation
 */
export function isRepayOperation(operation: ProtocolOperation): operation is RepayOperation {
    return operation.type === OperationType.REPAY;
}

/**
 * Check if an operation is a SwapOperation
 * @param {ProtocolOperation} operation - Operation to check
 * @returns {boolean} True if operation is a SwapOperation
 */
export function isSwapOperation(operation: ProtocolOperation): operation is SwapOperation {
    return operation.type === OperationType.SWAP;
}

/**
 * Check if an operation is an AddLiquidityOperation
 * @param {ProtocolOperation} operation - Operation to check
 * @returns {boolean} True if operation is an AddLiquidityOperation
 */
export function isAddLiquidityOperation(operation: ProtocolOperation): operation is AddLiquidityOperation {
    return operation.type === OperationType.ADD_LIQUIDITY;
}

/**
 * Check if an operation is a RemoveLiquidityOperation
 * @param {ProtocolOperation} operation - Operation to check
 * @returns {boolean} True if operation is a RemoveLiquidityOperation
 */
export function isRemoveLiquidityOperation(operation: ProtocolOperation): operation is RemoveLiquidityOperation {
    return operation.type === OperationType.REMOVE_LIQUIDITY;
}

/**
 * Check if an operation is a lending operation (supply, withdraw, borrow, repay)
 * @param {ProtocolOperation} operation - Operation to check
 * @returns {boolean} True if operation is a lending-related operation
 */
export function isLendingOperation(operation: ProtocolOperation): boolean {
    return (
        isSupplyOperation(operation) ||
        isWithdrawOperation(operation) ||
        isBorrowOperation(operation) ||
        isRepayOperation(operation)
    );
}

/**
 * Check if an operation is a DEX operation (swap, add/remove liquidity)
 * @param {ProtocolOperation} operation - Operation to check
 * @returns {boolean} True if operation is a DEX-related operation
 */
export function isDexOperation(operation: ProtocolOperation): boolean {
    return (
        isSwapOperation(operation) ||
        isAddLiquidityOperation(operation) ||
        isRemoveLiquidityOperation(operation)
    );
}

// ============================================
// Asset Type Guards
// ============================================

/**
 * Check if an asset is the native asset (XLM)
 * @param {Asset} asset - Asset to check
 * @returns {boolean} True if asset is native XLM
 */
export function isNativeAsset(asset: Asset): boolean {
    return asset.type === 'native';
}

/**
 * Check if an asset is a credit asset (has issuer)
 * @param {Asset} asset - Asset to check
 * @returns {boolean} True if asset is a credit asset
 */
export function isCreditAsset(asset: Asset): boolean {
    return asset.type === 'credit_alphanum4' || asset.type === 'credit_alphanum12';
}

/**
 * Check if an object is a valid Asset
 * @param {unknown} obj - Object to check
 * @returns {boolean} True if object is a valid Asset
 */
export function isAsset(obj: unknown): obj is Asset {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }

    const asset = obj as Record<string, unknown>;

    if (typeof asset.code !== 'string') {
        return false;
    }

    if (!['native', 'credit_alphanum4', 'credit_alphanum12'].includes(asset.type as string)) {
        return false;
    }

    // Non-native assets must have an issuer
    if (asset.type !== 'native' && typeof asset.issuer !== 'string') {
        return false;
    }

    return true;
}

// ============================================
// Validation Guards
// ============================================

/**
 * Check if a value is a valid Stellar address (public key)
 * @param {unknown} value - Value to check
 * @returns {boolean} True if value is a valid Stellar address
 */
export function isStellarAddress(value: unknown): value is string {
    if (typeof value !== 'string') {
        return false;
    }

    // Stellar public keys start with 'G' and are 56 characters long
    return /^G[A-Z2-7]{55}$/.test(value);
}

/**
 * Check if a value is a valid amount string
 * @param {unknown} value - Value to check
 * @returns {boolean} True if value is a valid positive decimal string
 */
export function isValidAmount(value: unknown): value is string {
    if (typeof value !== 'string') {
        return false;
    }

    const num = parseFloat(value);
    return !isNaN(num) && num > 0 && /^\d+(\.\d+)?$/.test(value);
}

/**
 * Check if a value is a valid operation type
 * @param {unknown} value - Value to check
 * @returns {boolean} True if value is a valid OperationType
 */
export function isOperationType(value: unknown): value is OperationType {
    return Object.values(OperationType).includes(value as OperationType);
}

/**
 * Check if an object is a valid base operation
 * @param {unknown} obj - Object to check
 * @returns {boolean} True if object has valid base operation properties
 */
export function isBaseOperation(obj: unknown): obj is BaseOperation {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }

    const op = obj as Record<string, unknown>;

    return (
        isOperationType(op.type) &&
        op.timestamp instanceof Date &&
        typeof op.walletAddress === 'string'
    );
}

/**
 * Check if an object is a valid ProtocolOperation
 * @param {unknown} obj - Object to check
 * @returns {boolean} True if object is a valid ProtocolOperation
 */
export function isProtocolOperation(obj: unknown): obj is ProtocolOperation {
    if (!isBaseOperation(obj)) {
        return false;
    }

    const op = obj as ProtocolOperation;

    switch (op.type) {
        case OperationType.SUPPLY:
        case OperationType.WITHDRAW:
            return isAsset((op as SupplyOperation).asset) && isValidAmount((op as SupplyOperation).amount);

        case OperationType.BORROW:
            return isAsset((op as BorrowOperation).asset) && isValidAmount((op as BorrowOperation).amount);

        case OperationType.REPAY:
            return isAsset((op as RepayOperation).asset) && isValidAmount((op as RepayOperation).amount);

        case OperationType.SWAP:
            const swap = op as SwapOperation;
            return (
                isAsset(swap.tokenIn) &&
                isAsset(swap.tokenOut) &&
                isValidAmount(swap.amountIn) &&
                isValidAmount(swap.minAmountOut)
            );

        case OperationType.ADD_LIQUIDITY:
            const addLiq = op as AddLiquidityOperation;
            return (
                isAsset(addLiq.tokenA) &&
                isAsset(addLiq.tokenB) &&
                isValidAmount(addLiq.amountA) &&
                isValidAmount(addLiq.amountB)
            );

        case OperationType.REMOVE_LIQUIDITY:
            const remLiq = op as RemoveLiquidityOperation;
            return typeof remLiq.poolAddress === 'string' && isValidAmount(remLiq.lpTokenAmount);

        default:
            return false;
    }
}
