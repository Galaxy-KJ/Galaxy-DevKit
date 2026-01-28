/**
 * @fileoverview Custom error classes for DeFi protocol operations
 * @description Provides specific error types for better error handling and debugging
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

/**
 * Error codes for protocol errors
 * @enum {string}
 */
export enum ProtocolErrorCode {
    // Initialization errors
    INIT_FAILED = 'INIT_FAILED',
    INVALID_CONFIG = 'INVALID_CONFIG',
    NETWORK_ERROR = 'NETWORK_ERROR',
    CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND',

    // Balance errors
    INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
    INSUFFICIENT_COLLATERAL = 'INSUFFICIENT_COLLATERAL',
    INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',

    // Operation errors
    INVALID_OPERATION = 'INVALID_OPERATION',
    INVALID_AMOUNT = 'INVALID_AMOUNT',
    INVALID_ASSET = 'INVALID_ASSET',
    INVALID_ADDRESS = 'INVALID_ADDRESS',
    OPERATION_NOT_SUPPORTED = 'OPERATION_NOT_SUPPORTED',
    SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
    DEADLINE_EXCEEDED = 'DEADLINE_EXCEEDED',

    // Contract errors
    CONTRACT_EXECUTION_FAILED = 'CONTRACT_EXECUTION_FAILED',
    CONTRACT_SIMULATION_FAILED = 'CONTRACT_SIMULATION_FAILED',
    TRANSACTION_FAILED = 'TRANSACTION_FAILED',

    // Health factor errors
    HEALTH_FACTOR_TOO_LOW = 'HEALTH_FACTOR_TOO_LOW',
    LIQUIDATION_RISK = 'LIQUIDATION_RISK',

    // Generic
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Base error class for all protocol errors
 * @class ProtocolError
 * @extends Error
 * @description Base class providing common functionality for all protocol-specific errors
 */
export class ProtocolError extends Error {
    /** Error code for programmatic handling */
    public readonly code: ProtocolErrorCode;
    /** Protocol that generated the error */
    public readonly protocolId?: string;
    /** Original error if this wraps another error */
    public readonly cause?: Error;
    /** Timestamp when error occurred */
    public readonly timestamp: Date;
    /** Additional context for debugging */
    public readonly context?: Record<string, unknown>;

    /**
     * Create a new ProtocolError
     * @param {string} message - Human-readable error message
     * @param {ProtocolErrorCode} code - Error code for programmatic handling
     * @param {object} options - Additional error options
     */
    constructor(
        message: string,
        code: ProtocolErrorCode = ProtocolErrorCode.UNKNOWN_ERROR,
        options?: {
            protocolId?: string;
            cause?: Error;
            context?: Record<string, unknown>;
        }
    ) {
        super(message);
        this.name = 'ProtocolError';
        this.code = code;
        this.protocolId = options?.protocolId;
        this.cause = options?.cause;
        this.context = options?.context;
        this.timestamp = new Date();

        // Maintains proper stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Convert error to a JSON-serializable object
     * @returns {object} JSON representation of the error
     */
    public toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            protocolId: this.protocolId,
            timestamp: this.timestamp.toISOString(),
            context: this.context,
            cause: this.cause?.message
        };
    }
}

/**
 * Error thrown when protocol initialization fails
 * @class ProtocolInitError
 * @extends ProtocolError
 * @description Thrown when a protocol fails to initialize (network issues, invalid config, etc.)
 */
export class ProtocolInitError extends ProtocolError {
    constructor(
        message: string,
        options?: {
            protocolId?: string;
            cause?: Error;
            context?: Record<string, unknown>;
        }
    ) {
        super(message, ProtocolErrorCode.INIT_FAILED, options);
        this.name = 'ProtocolInitError';
    }
}

/**
 * Error thrown when user has insufficient balance
 * @class InsufficientBalanceError
 * @extends ProtocolError
 * @description Thrown when user doesn't have enough balance to perform an operation
 */
export class InsufficientBalanceError extends ProtocolError {
    /** Asset that has insufficient balance */
    public readonly asset?: string;
    /** Required amount */
    public readonly required?: string;
    /** Available amount */
    public readonly available?: string;

    constructor(
        message: string,
        options?: {
            protocolId?: string;
            cause?: Error;
            context?: Record<string, unknown>;
            asset?: string;
            required?: string;
            available?: string;
        }
    ) {
        super(message, ProtocolErrorCode.INSUFFICIENT_BALANCE, {
            protocolId: options?.protocolId,
            cause: options?.cause,
            context: {
                ...options?.context,
                asset: options?.asset,
                required: options?.required,
                available: options?.available
            }
        });
        this.name = 'InsufficientBalanceError';
        this.asset = options?.asset;
        this.required = options?.required;
        this.available = options?.available;
    }
}

/**
 * Error thrown when an operation is invalid
 * @class InvalidOperationError
 * @extends ProtocolError
 * @description Thrown when an operation cannot be performed due to invalid parameters or state
 */
export class InvalidOperationError extends ProtocolError {
    /** The operation type that was attempted */
    public readonly operationType?: string;
    /** Reason why the operation is invalid */
    public readonly reason?: string;

    constructor(
        message: string,
        options?: {
            protocolId?: string;
            cause?: Error;
            context?: Record<string, unknown>;
            operationType?: string;
            reason?: string;
        }
    ) {
        super(message, ProtocolErrorCode.INVALID_OPERATION, {
            protocolId: options?.protocolId,
            cause: options?.cause,
            context: {
                ...options?.context,
                operationType: options?.operationType,
                reason: options?.reason
            }
        });
        this.name = 'InvalidOperationError';
        this.operationType = options?.operationType;
        this.reason = options?.reason;
    }
}

/**
 * Error thrown when a smart contract call fails
 * @class ContractError
 * @extends ProtocolError
 * @description Thrown when a Soroban smart contract execution or simulation fails
 */
export class ContractError extends ProtocolError {
    /** Contract address that failed */
    public readonly contractAddress?: string;
    /** Method that was called */
    public readonly method?: string;
    /** Transaction hash if available */
    public readonly transactionHash?: string;

    constructor(
        message: string,
        options?: {
            protocolId?: string;
            cause?: Error;
            context?: Record<string, unknown>;
            contractAddress?: string;
            method?: string;
            transactionHash?: string;
        }
    ) {
        super(message, ProtocolErrorCode.CONTRACT_EXECUTION_FAILED, {
            protocolId: options?.protocolId,
            cause: options?.cause,
            context: {
                ...options?.context,
                contractAddress: options?.contractAddress,
                method: options?.method,
                transactionHash: options?.transactionHash
            }
        });
        this.name = 'ContractError';
        this.contractAddress = options?.contractAddress;
        this.method = options?.method;
        this.transactionHash = options?.transactionHash;
    }
}

/**
 * Error thrown when slippage exceeds tolerance
 * @class SlippageExceededError
 * @extends ProtocolError
 * @description Thrown when a swap or liquidity operation exceeds slippage tolerance
 */
export class SlippageExceededError extends ProtocolError {
    /** Expected amount */
    public readonly expectedAmount?: string;
    /** Actual amount */
    public readonly actualAmount?: string;
    /** Slippage tolerance that was set */
    public readonly tolerance?: string;

    constructor(
        message: string,
        options?: {
            protocolId?: string;
            cause?: Error;
            context?: Record<string, unknown>;
            expectedAmount?: string;
            actualAmount?: string;
            tolerance?: string;
        }
    ) {
        super(message, ProtocolErrorCode.SLIPPAGE_EXCEEDED, {
            protocolId: options?.protocolId,
            cause: options?.cause,
            context: {
                ...options?.context,
                expectedAmount: options?.expectedAmount,
                actualAmount: options?.actualAmount,
                tolerance: options?.tolerance
            }
        });
        this.name = 'SlippageExceededError';
        this.expectedAmount = options?.expectedAmount;
        this.actualAmount = options?.actualAmount;
        this.tolerance = options?.tolerance;
    }
}

/**
 * Error thrown when health factor is too low
 * @class HealthFactorError
 * @extends ProtocolError
 * @description Thrown when an operation would result in an unsafe health factor
 */
export class HealthFactorError extends ProtocolError {
    /** Current health factor */
    public readonly currentHealthFactor?: string;
    /** Projected health factor after operation */
    public readonly projectedHealthFactor?: string;
    /** Minimum required health factor */
    public readonly minimumRequired?: string;

    constructor(
        message: string,
        options?: {
            protocolId?: string;
            cause?: Error;
            context?: Record<string, unknown>;
            currentHealthFactor?: string;
            projectedHealthFactor?: string;
            minimumRequired?: string;
        }
    ) {
        super(message, ProtocolErrorCode.HEALTH_FACTOR_TOO_LOW, {
            protocolId: options?.protocolId,
            cause: options?.cause,
            context: {
                ...options?.context,
                currentHealthFactor: options?.currentHealthFactor,
                projectedHealthFactor: options?.projectedHealthFactor,
                minimumRequired: options?.minimumRequired
            }
        });
        this.name = 'HealthFactorError';
        this.currentHealthFactor = options?.currentHealthFactor;
        this.projectedHealthFactor = options?.projectedHealthFactor;
        this.minimumRequired = options?.minimumRequired;
    }
}

/**
 * Check if an error is a ProtocolError
 * @param {unknown} error - Error to check
 * @returns {boolean} True if error is a ProtocolError
 */
export function isProtocolError(error: unknown): error is ProtocolError {
    return error instanceof ProtocolError;
}

/**
 * Wrap an unknown error in a ProtocolError
 * @param {unknown} error - Error to wrap
 * @param {string} protocolId - Protocol ID for context
 * @returns {ProtocolError} Wrapped error
 */
export function wrapError(error: unknown, protocolId?: string): ProtocolError {
    if (error instanceof ProtocolError) {
        return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    return new ProtocolError(message, ProtocolErrorCode.UNKNOWN_ERROR, {
        protocolId,
        cause
    });
}
