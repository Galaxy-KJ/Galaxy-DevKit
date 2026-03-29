/**
 * @fileoverview Example: Working with Protocol Operations
 * @description Demonstrates using operation types and type guards
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * 
 * This example demonstrates:
 * - Creating different operation types
 * - Using type guards to handle operations
 * - Error handling patterns
 * - Operation validation
 */

import {
    // Operation types
    OperationType,
    ProtocolOperation,
    SupplyOperation,
    WithdrawOperation,
    BorrowOperation,
    RepayOperation,
    SwapOperation,
    AddLiquidityOperation,
    RemoveLiquidityOperation,
    OperationStatus,
    GasEstimation,

    // Type guards
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
    isProtocolOperation,

    // Error classes
    ProtocolError,
    ProtocolErrorCode,
    InsufficientBalanceError,
    InvalidOperationError,
    SlippageExceededError,
    isProtocolError,
    wrapError,

    // Types
    Asset
} from '@galaxy/core-defi-protocols';

// ============================================
// Example 1: Creating Operations
// ============================================

const walletAddress = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3SACD63Z2N3G';

const xlmAsset: Asset = {
    code: 'XLM',
    type: 'native'
};

const usdcAsset: Asset = {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    type: 'credit_alphanum4'
};

// Supply operation
const supplyOp: SupplyOperation = {
    type: OperationType.SUPPLY,
    timestamp: new Date(),
    walletAddress,
    asset: usdcAsset,
    amount: '1000.0000000',
    memo: 'Initial deposit'
};

// Borrow operation with collateral
const borrowOp: BorrowOperation = {
    type: OperationType.BORROW,
    timestamp: new Date(),
    walletAddress,
    asset: usdcAsset,
    amount: '500.0000000',
    collateralAsset: xlmAsset
};

// Swap operation with slippage protection
const swapOp: SwapOperation = {
    type: OperationType.SWAP,
    timestamp: new Date(),
    walletAddress,
    tokenIn: xlmAsset,
    tokenOut: usdcAsset,
    amountIn: '100.0000000',
    minAmountOut: '99.0000000',  // 1% slippage tolerance
    slippageTolerance: '0.01',
    deadline: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
};

// Add liquidity operation
const addLiquidityOp: AddLiquidityOperation = {
    type: OperationType.ADD_LIQUIDITY,
    timestamp: new Date(),
    walletAddress,
    tokenA: xlmAsset,
    tokenB: usdcAsset,
    amountA: '1000.0000000',
    amountB: '5000.0000000'
};

// ============================================
// Example 2: Using Type Guards
// ============================================

function handleOperation(operation: ProtocolOperation): void {
    console.log(`Processing ${operation.type} operation...`);

    // Use type guards to narrow the type
    if (isSupplyOperation(operation)) {
        console.log(`Supplying ${operation.amount} of ${operation.asset.code}`);
    }
    else if (isWithdrawOperation(operation)) {
        console.log(`Withdrawing ${operation.amount} of ${operation.asset.code}`);
    }
    else if (isBorrowOperation(operation)) {
        console.log(`Borrowing ${operation.amount} of ${operation.asset.code}`);
        if (operation.collateralAsset) {
            console.log(`Using ${operation.collateralAsset.code} as collateral`);
        }
    }
    else if (isRepayOperation(operation)) {
        console.log(`Repaying ${operation.amount} of ${operation.asset.code}`);
        if (operation.repayAll) {
            console.log('Repaying full debt');
        }
    }
    else if (isSwapOperation(operation)) {
        console.log(`Swapping ${operation.amountIn} ${operation.tokenIn.code} for ${operation.tokenOut.code}`);
        console.log(`Minimum output: ${operation.minAmountOut}`);
    }
    else if (isAddLiquidityOperation(operation)) {
        console.log(`Adding liquidity: ${operation.amountA} ${operation.tokenA.code} + ${operation.amountB} ${operation.tokenB.code}`);
    }
    else if (isRemoveLiquidityOperation(operation)) {
        console.log(`Removing ${operation.lpTokenAmount} LP tokens from pool ${operation.poolAddress}`);
    }
}

// Categorize operations
function categorizeOperation(operation: ProtocolOperation): string {
    if (isLendingOperation(operation)) {
        return 'lending';
    }
    if (isDexOperation(operation)) {
        return 'dex';
    }
    return 'unknown';
}

// ============================================
// Example 3: Validation
// ============================================

function validateOperationInputs(
    address: string,
    asset: unknown,
    amount: string
): void {
    // Validate address
    if (!isStellarAddress(address)) {
        throw new InvalidOperationError('Invalid wallet address', {
            reason: 'Address must be a valid Stellar public key'
        });
    }

    // Validate asset
    if (!isAsset(asset)) {
        throw new InvalidOperationError('Invalid asset', {
            reason: 'Asset must have code, type, and issuer (for non-native)'
        });
    }

    // Validate amount
    if (!isValidAmount(amount)) {
        throw new InvalidOperationError('Invalid amount', {
            reason: 'Amount must be a positive number string'
        });
    }

    console.log('All inputs validated successfully');
}

// ============================================
// Example 4: Error Handling
// ============================================

async function executeOperation(operation: ProtocolOperation): Promise<void> {
    try {
        // Simulate operation execution
        if (isSwapOperation(operation)) {
            const slippage = 0.02; // 2% actual slippage
            const tolerance = parseFloat(operation.slippageTolerance || '0.01');

            if (slippage > tolerance) {
                throw new SlippageExceededError('Swap slippage exceeded tolerance', {
                    protocolId: 'soroswap',
                    expectedAmount: operation.minAmountOut,
                    actualAmount: '97.0000000',
                    tolerance: operation.slippageTolerance
                });
            }
        }

        if (isSupplyOperation(operation)) {
            // Simulate insufficient balance
            const balance = '500.0000000';
            if (parseFloat(operation.amount) > parseFloat(balance)) {
                throw new InsufficientBalanceError(
                    `Insufficient ${operation.asset.code} balance`,
                    {
                        protocolId: 'blend',
                        asset: operation.asset.code,
                        required: operation.amount,
                        available: balance
                    }
                );
            }
        }

        console.log('Operation executed successfully');

    } catch (error) {
        // Handle specific error types
        if (isProtocolError(error)) {
            console.error(`Protocol Error [${error.code}]: ${error.message}`);

            if (error instanceof InsufficientBalanceError) {
                console.log(`Need ${error.required}, have ${error.available}`);
            }

            if (error instanceof SlippageExceededError) {
                console.log(`Expected ${error.expectedAmount}, got ${error.actualAmount}`);
            }

            // Log to error tracking
            console.log('Error details:', error.toJSON());

        } else {
            // Wrap unknown errors
            const protocolError = wrapError(error, 'unknown-protocol');
            console.error('Unexpected error:', protocolError.message);
        }
    }
}

// ============================================
// Example 5: Building Operations Programmatically
// ============================================

function createSupplyOperation(
    wallet: string,
    asset: Asset,
    amount: string,
    memo?: string
): SupplyOperation {
    // Validate inputs first
    if (!isStellarAddress(wallet)) {
        throw new InvalidOperationError('Invalid wallet address');
    }

    if (!isAsset(asset)) {
        throw new InvalidOperationError('Invalid asset');
    }

    if (!isValidAmount(amount)) {
        throw new InvalidOperationError('Invalid amount');
    }

    return {
        type: OperationType.SUPPLY,
        timestamp: new Date(),
        walletAddress: wallet,
        asset,
        amount,
        memo
    };
}

function createSwapOperation(
    wallet: string,
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string,
    slippagePercent: number = 1
): SwapOperation {
    const expectedOut = parseFloat(amountIn); // Simplified
    const minOut = expectedOut * (1 - slippagePercent / 100);

    return {
        type: OperationType.SWAP,
        timestamp: new Date(),
        walletAddress: wallet,
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut: minOut.toFixed(7),
        slippageTolerance: (slippagePercent / 100).toString(),
        deadline: new Date(Date.now() + 10 * 60 * 1000)
    };
}

// ============================================
// Run Examples
// ============================================

async function main() {
    console.log('=== Operation Types Demo ===\n');

    // Handle different operations
    console.log('--- Processing Operations ---');
    handleOperation(supplyOp);
    handleOperation(borrowOp);
    handleOperation(swapOp);
    handleOperation(addLiquidityOp);

    // Categorize operations
    console.log('\n--- Categorizing Operations ---');
    console.log('Supply is:', categorizeOperation(supplyOp));
    console.log('Swap is:', categorizeOperation(swapOp));

    // Validation
    console.log('\n--- Validation ---');
    try {
        validateOperationInputs(walletAddress, usdcAsset, '1000.0000000');
    } catch (error) {
        console.error(error);
    }

    // Error handling
    console.log('\n--- Error Handling ---');
    await executeOperation(swapOp);
    await executeOperation(supplyOp);

    // Build operations programmatically
    console.log('\n--- Building Operations ---');
    const newSupply = createSupplyOperation(walletAddress, usdcAsset, '500.0000000', 'Test supply');
    console.log('Created supply operation:', newSupply.type);

    const newSwap = createSwapOperation(walletAddress, xlmAsset, usdcAsset, '100.0000000', 2);
    console.log('Created swap with min output:', newSwap.minAmountOut);
}

main().catch(console.error);
