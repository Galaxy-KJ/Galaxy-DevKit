/**
 * @fileoverview Function Signature Builder
 * @description Build and validate Soroban contract function signatures
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { xdr } from '@stellar/stellar-sdk';
import { ScValConverter } from './scval-converter';
import { ContractFunction, ScType } from '../types/contract-types';

export class FunctionSignatureBuilder {
  /**
   * Build function signature hash
   */
  static buildSignatureHash(funcName: string, inputTypes: ScType[]): string {
    const signature = this.buildSignatureString(funcName, inputTypes);
    // This is a simplified implementation
    // In practice, you'd use proper hashing like SHA-256
    return this.hashSignature(signature);
  }

  /**
   * Build function signature string
   */
  static buildSignatureString(funcName: string, inputTypes: ScType[]): string {
    const typesStr = inputTypes.join(', ');
    return `${funcName}(${typesStr})`;
  }

  /**
   * Build function selector (first 4 bytes of signature hash)
   */
  static buildFunctionSelector(funcName: string, inputTypes: ScType[]): Buffer {
    const hash = this.buildSignatureHash(funcName, inputTypes);
    // Return first 4 bytes (32 bits) of hash
    return Buffer.from(hash.slice(0, 8), 'hex');
  }

  /**
   * Create function invocation ScVal
   */
  static createInvocation(
    funcName: string,
    args: any[],
    inputTypes?: ScType[]
  ): xdr.ScVal {
    // Create function name as symbol
    const nameScVal = xdr.ScVal.scvSymbol(funcName);

    // Convert arguments to ScVal
    const argScVals = args.map((arg, index) => {
      const type = inputTypes ? inputTypes[index] : undefined;
      return ScValConverter.toScVal(arg, type);
    });

    // Create invocation tuple
    return xdr.ScVal.scvVec([nameScVal, ...argScVals]);
  }

  /**
   * Validate function arguments
   */
  static validateArguments(
    func: ContractFunction,
    args: any[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check argument count
    if (args.length !== func.inputs.length) {
      errors.push(
        `Expected ${func.inputs.length} arguments, got ${args.length}. ` +
          `Expected: [${func.inputs.map(i => i.name).join(', ')}]`
      );
      return { valid: false, errors };
    }

    // Validate each argument
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const input = func.inputs[i];
      const validationError = this.validateArgumentType(arg, input.type);

      if (validationError) {
        errors.push(`Argument ${i} (${input.name}): ${validationError}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate single argument type
   */
  static validateArgumentType(arg: any, expectedType: ScType): string | null {
    try {
      // Try to convert to expected type
      ScValConverter.toScVal(arg, expectedType);
      return null;
    } catch (error) {
      return `Type validation failed: ${error.message}`;
    }
  }

  /**
   * Parse function signature from string
   */
  static parseSignature(signature: string): {
    name: string;
    inputTypes: ScType[];
  } {
    const match = signature.match(/^(\w+)\((.*)\)$/);
    if (!match) {
      throw new Error(`Invalid function signature format: ${signature}`);
    }

    const name = match[1];
    const inputTypesStr = match[2];

    let inputTypes: ScType[] = [];
    if (inputTypesStr.trim()) {
      inputTypes = inputTypesStr.split(',').map(type => type.trim());
    }

    return { name, inputTypes };
  }

  /**
   * Build method name with namespace
   */
  static buildMethodSignature(
    namespace: string,
    method: string,
    inputTypes: ScType[]
  ): string {
    const fullName = `${namespace}_${method}`;
    return this.buildSignatureString(fullName, inputTypes);
  }

  /**
   * Create error signature
   */
  static createErrorSignature(errorName: string, inputTypes: ScType[]): string {
    return this.buildSignatureString(`error_${errorName}`, inputTypes);
  }

  /**
   * Create event signature
   */
  static createEventSignature(
    eventName: string,
    topicTypes: ScType[],
    dataTypes: ScType[]
  ): {
    signature: string;
    topicHash: string;
    dataHash: string;
  } {
    const topicSignature = this.buildSignatureString(eventName, topicTypes);
    const dataSignature = this.buildSignatureString(
      `${eventName}_data`,
      dataTypes
    );

    return {
      signature: `${topicSignature} -> ${dataSignature}`,
      topicHash: this.hashSignature(topicSignature),
      dataHash: this.hashSignature(dataSignature),
    };
  }

  /**
   * Compare two signatures
   */
  static compareSignatures(sig1: string, sig2: string): boolean {
    return sig1 === sig2;
  }

  /**
   * Check if function matches signature
   */
  static matchesSignature(
    func: ContractFunction,
    funcName: string,
    inputTypes: ScType[]
  ): boolean {
    if (func.name !== funcName) {
      return false;
    }

    if (func.inputs.length !== inputTypes.length) {
      return false;
    }

    for (let i = 0; i < func.inputs.length; i++) {
      if (func.inputs[i].type !== inputTypes[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get function signature length
   */
  static getSignatureLength(funcName: string, inputTypes: ScType[]): number {
    const signature = this.buildSignatureString(funcName, inputTypes);
    return signature.length;
  }

  /**
   * Optimize signature for gas
   */
  static optimizeSignature(
    funcName: string,
    inputTypes: ScType[]
  ): {
    original: string;
    optimized: string;
    savings: number;
  } {
    const original = this.buildSignatureString(funcName, inputTypes);

    // Apply simple optimizations
    let optimized = original;

    // Remove whitespace
    optimized = optimized.replace(/\s+/g, '');

    // Use shorter type aliases if possible
    optimized = optimized.replace(/uint64/g, 'u64');
    optimized = optimized.replace(/uint32/g, 'u32');
    optimized = optimized.replace(/int64/g, 'i64');
    optimized = optimized.replace(/int32/g, 'i32');

    const savings = original.length - optimized.length;

    return { original, optimized, savings };
  }

  /**
   * Hash signature (simplified implementation)
   */
  private static hashSignature(signature: string): string {
    // This is a simplified implementation
    // In practice, you'd use crypto.createHash('sha256').update(signature).digest('hex')
    // For now, return a hash-like string
    let hash = 0;
    for (let i = 0; i < signature.length; i++) {
      const char = signature.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Convert to hex string
    const absHash = Math.abs(hash);
    return absHash.toString(16).padStart(8, '0').repeat(4); // 32-character hex string
  }

  /**
   * Create signature from ScVal arguments
   */
  static createSignatureFromScVals(
    funcName: string,
    args: xdr.ScVal[]
  ): string {
    const inputTypes = args.map(arg => this.inferTypeFromScVal(arg));
    return this.buildSignatureString(funcName, inputTypes);
  }

  /**
   * Infer ScType from ScVal
   */
  private static inferTypeFromScVal(scVal: xdr.ScVal): ScType {
    switch (scVal.switch()) {
      case xdr.ScValType.scvVoid():
        return 'void';
      case xdr.ScValType.scvBool():
        return 'bool';
      case xdr.ScValType.scvU32():
        return 'u32';
      case xdr.ScValType.scvI32():
        return 'i32';
      case xdr.ScValType.scvU64():
        return 'u64';
      case xdr.ScValType.scvI64():
        return 'i64';
      case xdr.ScValType.scvU128():
        return 'u128';
      case xdr.ScValType.scvI128():
        return 'i128';
      case xdr.ScValType.scvU256():
        return 'u256';
      case xdr.ScValType.scvI256():
        return 'i256';
      case xdr.ScValType.scvF32():
        return 'f32';
      case xdr.ScValType.scvF64():
        return 'f64';
      case xdr.ScValType.scvBytes():
        return 'bytes';
      case xdr.ScValType.scvString():
        return 'string';
      case xdr.ScValType.scvSymbol():
        return 'symbol';
      case xdr.ScValType.scvAddress():
        return 'address';
      case xdr.ScValType.scvVec():
        return 'vec';
      case xdr.ScValType.scvMap():
        return 'map';
      default:
        return 'void';
    }
  }

  /**
   * Generate signature documentation
   */
  static generateSignatureDocs(func: ContractFunction): string {
    const signature = this.buildSignatureString(
      func.name,
      func.inputs.map(i => i.type)
    );
    const returnTypeStr =
      func.outputs.length === 1
        ? func.outputs[0]
        : `(${func.outputs.join(', ')})`;

    let docs = `**${signature} -> ${returnTypeStr}**\n\n`;

    if (func.inputs.length > 0) {
      docs += '**Arguments:**\n';
      for (const input of func.inputs) {
        docs += `- \`${input.name}\` (${input.type})\n`;
      }
      docs += '\n';
    }

    if (func.outputs.length > 0) {
      docs += '**Returns:**\n';
      if (func.outputs.length === 1) {
        docs += `- ${func.outputs[0]}\n`;
      } else {
        for (let i = 0; i < func.outputs.length; i++) {
          docs += `- Output ${i}: ${func.outputs[i]}\n`;
        }
      }
    }

    return docs;
  }
}
