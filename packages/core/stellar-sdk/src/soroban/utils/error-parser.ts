/**
 * @fileoverview Error Parser
 * @description Parse and handle Soroban contract errors
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { xdr } from '@stellar/stellar-sdk';

export class SorobanError extends Error {
  public readonly code: number;
  public readonly type: string;
  public readonly contractId?: string;
  public readonly method?: string;

  constructor(message: string, code: number = 0, type: string = 'Unknown') {
    super(message);
    this.name = 'SorobanError';
    this.code = code;
    this.type = type;
  }

  static withContext(
    message: string,
    code: number,
    type: string,
    context?: { contractId?: string; method?: string }
  ): SorobanError {
    const error = new SorobanError(message, code, type);
    if (context) {
      Object.defineProperty(error, 'contractId', {
        value: context.contractId,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(error, 'method', {
        value: context.method,
        writable: true,
        configurable: true,
      });
    }
    return error;
  }
}

export class ErrorParser {
  /**
   * Parse Soroban error from result
   */
  static parseError(result?: xdr.ScVal): SorobanError {
    if (!result) {
      return new SorobanError('Unknown error occurred', -1, 'Unknown');
    }

    try {
      // Try to parse as error struct
      const errorValue = this.extractErrorValue(result);

      if (errorValue instanceof Map) {
        return this.parseErrorStruct(errorValue);
      }

      // Try to parse as error code
      if (typeof errorValue === 'number') {
        return this.parseErrorCode(errorValue);
      }

      // Try to parse as error string
      if (typeof errorValue === 'string') {
        return new SorobanError(errorValue, 0, 'Custom');
      }

      return new SorobanError(
        `Unrecognized error format: ${errorValue}`,
        -1,
        'InvalidFormat'
      );
    } catch (error) {
      return new SorobanError(
        `Failed to parse error: ${error.message}`,
        -2,
        'ParseError'
      );
    }
  }

  /**
   * Parse transaction error
   */
  static parseTransactionError(
    resultXdr?: string,
    metaXdr?: string
  ): SorobanError {
    try {
      if (resultXdr) {
        const result = xdr.TransactionResult.fromXDR(resultXdr, 'base64');
        if (result.result().switch() === xdr.TransactionResultCode.txFailed()) {
          const operations = result.result().results() || [];
          for (const op of operations) {
            if (
              op.tr()?.switch() ===
              xdr.TransactionResultResultCode.txInternalError()
            ) {
              return this.parseError(op.tr().value());
            }
          }
        }
      }

      // Parse meta for additional error information
      if (metaXdr) {
        const meta = xdr.TransactionMeta.fromXDR(metaXdr, 'base64');
        return this.parseMetaError(meta);
      }

      return new SorobanError(
        'Transaction failed but no specific error found',
        -1,
        'TransactionFailed'
      );
    } catch (error) {
      return new SorobanError(
        `Failed to parse transaction error: ${error.message}`,
        -2,
        'ParseError'
      );
    }
  }

  /**
   * Parse simulation error
   */
  static parseSimulationError(
    error?: string,
    result?: xdr.ScVal
  ): SorobanError {
    if (error) {
      // Try to extract error details from error string
      if (error.includes('insufficient fee')) {
        return new SorobanError(
          'Insufficient fee for transaction',
          4001,
          'InsufficientFee'
        );
      }
      if (error.includes('insufficient balance')) {
        return new SorobanError(
          'Insufficient balance',
          4002,
          'InsufficientBalance'
        );
      }
      if (error.includes('contract not found')) {
        return new SorobanError('Contract not found', 4003, 'ContractNotFound');
      }
      if (error.includes('method not found')) {
        return new SorobanError('Method not found', 4004, 'MethodNotFound');
      }
      if (error.includes('invalid argument')) {
        return new SorobanError('Invalid argument', 4005, 'InvalidArgument');
      }

      return new SorobanError(error, 4000, 'SimulationError');
    }

    if (result) {
      return this.parseError(result);
    }

    return new SorobanError('Simulation failed', 4000, 'SimulationError');
  }

  /**
   * Parse common error codes
   */
  private static parseErrorCode(code: number): SorobanError {
    switch (code) {
      case 1:
        return new SorobanError('Contract panicked', 1, 'ContractPanic');
      case 2:
        return new SorobanError('Arithmetic overflow', 2, 'ArithmeticOverflow');
      case 3:
        return new SorobanError('Division by zero', 3, 'DivisionByZero');
      case 4:
        return new SorobanError('Invalid arithmetic', 4, 'InvalidArithmetic');
      case 5:
        return new SorobanError('Invalid input', 5, 'InvalidInput');
      case 6:
        return new SorobanError('Index out of bounds', 6, 'IndexOutOfBounds');
      case 7:
        return new SorobanError(
          'Memory access violation',
          7,
          'MemoryAccessViolation'
        );
      case 8:
        return new SorobanError('Invalid conversion', 8, 'InvalidConversion');
      case 9:
        return new SorobanError('Missing value in optional', 9, 'MissingValue');
      case 10:
        return new SorobanError(
          'Expected error in result',
          10,
          'ExpectedError'
        );
      case 11:
        return new SorobanError('Host context error', 11, 'HostContextError');
      default:
        return new SorobanError(
          `Unknown error code: ${code}`,
          code,
          'UnknownCode'
        );
    }
  }

  /**
   * Parse error struct from Map
   */
  private static parseErrorStruct(errorMap: Map<any, any>): SorobanError {
    const code = errorMap.get('code');
    const message = errorMap.get('message');
    const type = errorMap.get('type');

    if (typeof code === 'number') {
      return new SorobanError(
        typeof message === 'string' ? message : 'Contract error',
        code,
        typeof type === 'string' ? type : 'ContractError'
      );
    }

    return new SorobanError(
      typeof message === 'string' ? message : 'Unknown contract error',
      0,
      typeof type === 'string' ? type : 'ContractError'
    );
  }

  /**
   * Extract error value from ScVal
   */
  private static extractErrorValue(result: xdr.ScVal): any {
    switch (result.switch()) {
      case xdr.ScValType.scvError():
        // Error is encoded as a ScVal containing error information
        return result.error();

      case xdr.ScValType.scvU32():
        return result.u32();

      case xdr.ScValType.scvI32():
        return result.i32();

      case xdr.ScValType.scvString():
        return result.str().toString();

      case xdr.ScValType.scvSymbol():
        return result.symbol().toString();

      case xdr.ScValType.scvMap():
        const map = new Map();
        for (const entry of result.map()) {
          const key = this.extractScValValue(entry.key());
          const value = this.extractScValValue(entry.val());
          map.set(key, value);
        }
        return map;

      default:
        return result;
    }
  }

  /**
   * Extract primitive value from ScVal
   */
  private static extractScValValue(scVal: xdr.ScVal): any {
    switch (scVal.switch()) {
      case xdr.ScValType.scvVoid():
        return null;
      case xdr.ScValType.scvBool():
        return scVal.bool();
      case xdr.ScValType.scvU32():
        return scVal.u32();
      case xdr.ScValType.scvI32():
        return scVal.i32();
      case xdr.ScValType.scvString():
        return scVal.str().toString();
      case xdr.ScValType.scvSymbol():
        return scVal.symbol().toString();
      default:
        return scVal;
    }
  }

  /**
   * Parse error from transaction meta
   */
  private static parseMetaError(meta: xdr.TransactionMeta): SorobanError {
    const v3 = meta.v3();
    if (!v3) {
      return new SorobanError(
        'Transaction meta version not supported',
        -1,
        'UnsupportedVersion'
      );
    }

    const sorobanMeta = v3.sorobanMeta();
    if (!sorobanMeta) {
      return new SorobanError(
        'No Soroban meta found',
        -1,
        'MissingSorobanMeta'
      );
    }

    // Check for diagnostic events that might contain error information
    for (const event of sorobanMeta.events()) {
      if (event.type().equals(xdr.ContractEventType.contractError())) {
        return this.parseError(event.data());
      }
    }

    // Check for exceptions
    const ext = v3.ext();
    if (ext.switch() === xdr.TransactionMetaExtension.v1()) {
      const v1Ext = ext.v1();
      if (v1Ext.sorobanMeta()) {
        // Additional error parsing logic could go here
      }
    }

    return new SorobanError(
      'Transaction failed but specific error not found',
      -1,
      'TransactionError'
    );
  }

  /**
   * Check if error is recoverable
   */
  static isRecoverableError(error: SorobanError): boolean {
    const recoverableTypes = [
      'InsufficientFee',
      'InsufficientBalance',
      'NetworkError',
      'Timeout',
    ];

    return recoverableTypes.includes(error.type);
  }

  /**
   * Check if error should be retried
   */
  static shouldRetry(error: SorobanError, attemptCount: number): boolean {
    if (!this.isRecoverableError(error)) {
      return false;
    }

    // Don't retry too many times
    if (attemptCount >= 3) {
      return false;
    }

    // Don't retry certain errors even if they're recoverable
    const nonRetryableTypes = ['InsufficientBalance', 'ContractNotFound'];

    return !nonRetryableTypes.includes(error.type);
  }

  /**
   * Get retry delay for error
   */
  static getRetryDelay(error: SorobanError, attemptCount: number): number {
    // Base delay with exponential backoff
    let baseDelay = 1000; // 1 second

    switch (error.type) {
      case 'InsufficientFee':
        baseDelay = 2000; // 2 seconds
        break;
      case 'NetworkError':
        baseDelay = 5000; // 5 seconds
        break;
      case 'Timeout':
        baseDelay = 3000; // 3 seconds
        break;
    }

    return baseDelay * Math.pow(2, attemptCount - 1);
  }

  /**
   * Format error for display
   */
  static formatError(error: SorobanError): string {
    let message = error.message;

    if (error.contractId) {
      message += ` (Contract: ${error.contractId})`;
    }

    if (error.method) {
      message += ` (Method: ${error.method})`;
    }

    if (error.code !== 0) {
      message += ` (Code: ${error.code})`;
    }

    message += ` (Type: ${error.type})`;

    return message;
  }
}
