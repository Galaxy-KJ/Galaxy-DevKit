/**
 * @fileoverview Soroban type conversion utilities
 * @description Convert between JavaScript types and Soroban ScVal
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { xdr, ScInt, Address } from '@stellar/stellar-sdk';
import { ScType } from '../types/contract-types';

export class ScValConverter {
  /**
   * Convert JavaScript value to ScVal
   */
  static toScVal(value: any, type?: ScType): xdr.ScVal {
    if (value === null || value === undefined) {
      return xdr.ScVal.scvVoid();
    }

    if (type) {
      return this.toTypedScVal(value, type);
    }

    // Auto-detect type
    if (typeof value === 'boolean') {
      return xdr.ScVal.scvBool(value);
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return xdr.ScVal.scvI32(value);
      }
      return xdr.ScVal.scvI64(new ScInt(value).toI64());
    }

    if (typeof value === 'bigint') {
      if (value >= 0) {
        return xdr.ScVal.scvU64(new ScInt(value).toU64());
      }
      return xdr.ScVal.scvI64(new ScInt(value).toI64());
    }

    if (typeof value === 'string') {
      // Check if it's an address
      if (value.startsWith('G') && value.length === 56) {
        try {
          const address = new Address(value);
          return address.toScVal();
        } catch {
          // Not a valid address, treat as string
        }
      }
      return xdr.ScVal.scvString(value);
    }

    if (Buffer.isBuffer(value)) {
      return xdr.ScVal.scvBytes(value);
    }

    if (Array.isArray(value)) {
      const scVals = value.map(item => this.toScVal(item));
      return xdr.ScVal.scvVec(scVals);
    }

    if (typeof value === 'object') {
      // Handle Map
      if (value instanceof Map) {
        const entries = Array.from(value.entries()).map(
          ([k, v]) =>
            new xdr.ScMapEntry({
              key: this.toScVal(k),
              val: this.toScVal(v),
            })
        );
        return xdr.ScVal.scvMap(entries);
      }

      // Handle object as Map
      const entries = Object.entries(value).map(
        ([k, v]) =>
          new xdr.ScMapEntry({
            key: this.toScVal(k),
            val: this.toScVal(v),
          })
      );
      return xdr.ScVal.scvMap(entries);
    }

    throw new Error(`Unsupported type for ScVal conversion: ${typeof value}`);
  }

  /**
   * Convert JavaScript value to typed ScVal
   */
  static toTypedScVal(value: any, type: ScType): xdr.ScVal {
    switch (type) {
      case 'void':
        return xdr.ScVal.scvVoid();

      case 'bool':
        return xdr.ScVal.scvBool(Boolean(value));

      case 'u32':
        return xdr.ScVal.scvU32(Number(value));

      case 'i32':
        return xdr.ScVal.scvI32(Number(value));

      case 'u64':
        return xdr.ScVal.scvU64(new ScInt(value).toU64());

      case 'i64':
        return xdr.ScVal.scvI64(new ScInt(value).toI64());

      case 'u128':
        return xdr.ScVal.scvU128(new ScInt(value).toU128());

      case 'i128':
        return xdr.ScVal.scvI128(new ScInt(value).toI128());

      case 'u256':
        return xdr.ScVal.scvU256(new ScInt(value).toU256());

      case 'i256':
        return xdr.ScVal.scvI256(new ScInt(value).toI256());

      case 'f32':
        return xdr.ScVal.scvF32(new xdr.Float(Number(value)));

      case 'f64':
        return xdr.ScVal.scvF64(new xdr.Double(Number(value)));

      case 'bytes':
        return xdr.ScVal.scvBytes(
          Buffer.isBuffer(value) ? value : Buffer.from(value)
        );

      case 'string':
        return xdr.ScVal.scvString(String(value));

      case 'symbol':
        return xdr.ScVal.scvSymbol(value);

      case 'address':
        if (typeof value === 'string') {
          return new Address(value).toScVal();
        }
        return value.toScVal();

      case 'option':
        if (value === null || value === undefined) {
          return xdr.ScVal.scvVoid();
        }
        return this.toScVal(value);

      case 'vec':
        if (!Array.isArray(value)) {
          throw new Error('Expected array for vec type');
        }
        return xdr.ScVal.scvVec(value.map(item => this.toScVal(item)));

      case 'map':
        if (!(value instanceof Map) && typeof value !== 'object') {
          throw new Error('Expected object or Map for map type');
        }
        const entries =
          value instanceof Map
            ? Array.from(value.entries())
            : Object.entries(value);

        return xdr.ScVal.scvMap(
          entries.map(
            ([k, v]) =>
              new xdr.ScMapEntry({
                key: this.toScVal(k),
                val: this.toScVal(v),
              })
          )
        );

      case 'set':
        if (!Array.isArray(value) && !(value instanceof Set)) {
          throw new Error('Expected array or Set for set type');
        }
        const values = value instanceof Set ? Array.from(value) : value;
        return xdr.ScVal.scvVec(values.map(item => this.toScVal(item)));

      case 'tuple':
        if (!Array.isArray(value)) {
          throw new Error('Expected array for tuple type');
        }
        return xdr.ScVal.scvVec(value.map(item => this.toScVal(item)));

      default:
        throw new Error(`Unsupported ScType: ${type}`);
    }
  }

  /**
   * Convert ScVal to JavaScript value
   */
  static fromScVal(scVal: xdr.ScVal): any {
    switch (scVal.switch()) {
      case xdr.ScValType.scvVoid():
        return null;

      case xdr.ScValType.scvBool():
        return scVal.bool();

      case xdr.ScValType.scvU32():
        return scVal.u32();

      case xdr.ScValType.scvI32():
        return scVal.i32();

      case xdr.ScValType.scvU64():
        return new ScInt(scVal.u64()).toBigInt();

      case xdr.ScValType.scvI64():
        return new ScInt(scVal.i64()).toBigInt();

      case xdr.ScValType.scvU128():
        return new ScInt(scVal.u128()).toBigInt();

      case xdr.ScValType.scvI128():
        return new ScInt(scVal.i128()).toBigInt();

      case xdr.ScValType.scvU256():
        return new ScInt(scVal.u256()).toBigInt();

      case xdr.ScValType.scvI256():
        return new ScInt(scVal.i256()).toBigInt();

      case xdr.ScValType.scvF32():
        return scVal.f32();

      case xdr.ScValType.scvF64():
        return scVal.f64();

      case xdr.ScValType.scvBytes():
        return scVal.bytes();

      case xdr.ScValType.scvString():
        return scVal.str().toString();

      case xdr.ScValType.scvSymbol():
        return scVal.symbol().toString();

      case xdr.ScValType.scvAddress():
        return Address.fromScVal(scVal).toString();

      case xdr.ScValType.scvVec():
        return scVal.vec().map(item => this.fromScVal(item));

      case xdr.ScValType.scvMap():
        const map = new Map();
        for (const entry of scVal.map()) {
          map.set(this.fromScVal(entry.key()), this.fromScVal(entry.val()));
        }
        return map;

      case xdr.ScValType.scvContractInstance():
        return scVal.instance();

      case xdr.ScValType.scvLedgerKeyNonce():
        return scVal.nonceKey();

      case xdr.ScValType.scvLedgerKeyContractCode():
        return scVal.contractCode();

      case xdr.ScValType.scvLedgerKeyContractData():
        return scVal.contractData();

      case xdr.ScValType.scvLedgerKeyState():
        return scVal.state();

      default:
        throw new Error(`Unsupported ScVal type: ${scVal.switch().name}`);
    }
  }

  /**
   * Encode function arguments
   */
  static encodeArgs(args: any[], types?: ScType[]): xdr.ScVal[] {
    if (types && types.length !== args.length) {
      throw new Error('Number of types must match number of arguments');
    }

    return args.map((arg, index) => {
      const type = types ? types[index] : undefined;
      return this.toScVal(arg, type);
    });
  }

  /**
   * Decode function result
   */
  static decodeResult(result: xdr.ScVal, type?: ScType): any {
    if (type) {
      return this.fromTypedScVal(result, type);
    }
    return this.fromScVal(result);
  }

  /**
   * Convert ScVal to typed JavaScript value
   */
  static fromTypedScVal(scVal: xdr.ScVal, type: ScType): any {
    switch (type) {
      case 'void':
        return null;

      case 'bool':
        return scVal.switch() === xdr.ScValType.scvBool() ? scVal.bool() : null;

      case 'u32':
        return scVal.switch() === xdr.ScValType.scvU32() ? scVal.u32() : null;

      case 'i32':
        return scVal.switch() === xdr.ScValType.scvI32() ? scVal.i32() : null;

      case 'u64':
      case 'i64':
      case 'u128':
      case 'i128':
      case 'u256':
      case 'i256':
        return this.fromScVal(scVal);

      case 'f32':
        return scVal.switch() === xdr.ScValType.scvF32() ? scVal.f32() : null;

      case 'f64':
        return scVal.switch() === xdr.ScValType.scvF64() ? scVal.f64() : null;

      case 'bytes':
        return scVal.switch() === xdr.ScValType.scvBytes()
          ? scVal.bytes()
          : null;

      case 'string':
        return scVal.switch() === xdr.ScValType.scvString()
          ? scVal.str().toString()
          : null;

      case 'symbol':
        return scVal.switch() === xdr.ScValType.scvSymbol()
          ? scVal.symbol().toString()
          : null;

      case 'address':
        return scVal.switch() === xdr.ScValType.scvAddress()
          ? Address.fromScVal(scVal).toString()
          : null;

      case 'option':
        if (scVal.switch() === xdr.ScValType.scvVoid()) {
          return null;
        }
        return this.fromScVal(scVal);

      case 'vec':
      case 'tuple':
        return scVal.switch() === xdr.ScValType.scvVec()
          ? scVal.vec().map(item => this.fromScVal(item))
          : null;

      case 'map':
        if (scVal.switch() === xdr.ScValType.scvMap()) {
          const obj: Record<string, any> = {};
          for (const entry of scVal.map()) {
            const key = this.fromScVal(entry.key());
            const val = this.fromScVal(entry.val());
            obj[typeof key === 'string' ? key : String(key)] = val;
          }
          return obj;
        }
        return null;

      case 'set':
        return scVal.switch() === xdr.ScValType.scvVec()
          ? new Set(scVal.vec().map(item => this.fromScVal(item)))
          : null;

      default:
        throw new Error(`Unsupported ScType: ${type}`);
    }
  }

  /**
   * Convert JavaScript symbol to ScVal symbol
   */
  static toSymbol(value: string): xdr.ScVal {
    return xdr.ScVal.scvSymbol(value);
  }

  /**
   * Convert JavaScript address to ScVal address
   */
  static toAddress(address: string): xdr.ScVal {
    return new Address(address).toScVal();
  }

  /**
   * Convert JavaScript bytes to ScVal bytes
   */
  static toBytes(data: string | Buffer): xdr.ScVal {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'hex');
    return xdr.ScVal.scvBytes(buffer);
  }
}
