/**
 * @fileoverview ScValConverter tests
 * @description Test suite for ScVal conversion utilities
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { ScValConverter } from '../utils/scval-converter';
import { xdr } from '@stellar/stellar-sdk';
import { ScType } from '../types/contract-types';

describe('ScValConverter', () => {
  describe('toScVal', () => {
    it('should convert boolean to ScVal', () => {
      const result = ScValConverter.toScVal(true);
      expect(result.switch()).toBe(xdr.ScValType.scvBool());
      expect(result.bool()).toBe(true);
    });

    it('should convert number to ScVal', () => {
      const result = ScValConverter.toScVal(42);
      expect(result.switch()).toBe(xdr.ScValType.scvI32());
      expect(result.i32()).toBe(42);
    });

    it('should convert string to ScVal', () => {
      const result = ScValConverter.toScVal('hello');
      expect(result.switch()).toBe(xdr.ScValType.scvString());
      expect(result.str().toString()).toBe('hello');
    });

    it('should convert Stellar address to ScVal', () => {
      const address =
        'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53';
      const result = ScValConverter.toScVal(address);
      expect(result.switch()).toBe(xdr.ScValType.scvAddress());
    });

    it('should convert array to ScVal', () => {
      const result = ScValConverter.toScVal([1, 2, 3]);
      expect(result.switch()).toBe(xdr.ScValType.scvVec());
      expect(result.vec().length).toBe(3);
    });

    it('should convert object to ScVal map', () => {
      const obj = { key1: 'value1', key2: 42 };
      const result = ScValConverter.toScVal(obj);
      expect(result.switch()).toBe(xdr.ScValType.scvMap());
      expect(result.map().length).toBe(2);
    });

    it('should convert null/undefined to void', () => {
      const result1 = ScValConverter.toScVal(null);
      expect(result1.switch()).toBe(xdr.ScValType.scvVoid());

      const result2 = ScValConverter.toScVal(undefined);
      expect(result2.switch()).toBe(xdr.ScValType.scvVoid());
    });
  });

  describe('fromScVal', () => {
    it('should convert ScVal boolean back to JavaScript boolean', () => {
      const scVal = xdr.ScVal.scvBool(true);
      const result = ScValConverter.fromScVal(scVal);
      expect(result).toBe(true);
    });

    it('should convert ScVal number back to JavaScript number', () => {
      const scVal = xdr.ScVal.scvI32(42);
      const result = ScValConverter.fromScVal(scVal);
      expect(result).toBe(42);
    });

    it('should convert ScVal string back to JavaScript string', () => {
      const scVal = xdr.ScVal.scvString('hello');
      const result = ScValConverter.fromScVal(scVal);
      expect(result).toBe('hello');
    });

    it('should convert ScVal vec back to JavaScript array', () => {
      const vec = [
        xdr.ScVal.scvI32(1),
        xdr.ScVal.scvI32(2),
        xdr.ScVal.scvI32(3),
      ];
      const scVal = xdr.ScVal.scvVec(vec);
      const result = ScValConverter.fromScVal(scVal);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should convert ScVal map back to JavaScript Map', () => {
      const entries = [
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvString('key1'),
          val: xdr.ScVal.scvString('value1'),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvString('key2'),
          val: xdr.ScVal.scvI32(42),
        }),
      ];
      const scVal = xdr.ScVal.scvMap(entries);
      const result = ScValConverter.fromScVal(scVal);
      expect(result).toBeInstanceOf(Map);
      expect(result.get('key1')).toBe('value1');
      expect(result.get('key2')).toBe(42);
    });
  });

  describe('encodeArgs', () => {
    it('should encode argument array to ScVal array', () => {
      const args = [42, 'hello', true];
      const result = ScValConverter.encodeArgs(args);
      expect(result).toHaveLength(3);
      expect(result[0].switch()).toBe(xdr.ScValType.scvI32());
      expect(result[1].switch()).toBe(xdr.ScValType.scvString());
      expect(result[2].switch()).toBe(xdr.ScValType.scvBool());
    });

    it('should encode with specified types', () => {
      const args = [42, 1000000];
      const types: ScType[] = ['u32', 'u64'];
      const result = ScValConverter.encodeArgs(args, types);
      expect(result[0].switch()).toBe(xdr.ScValType.scvU32());
      expect(result[1].switch()).toBe(xdr.ScValType.scvU64());
    });

    it('should throw error when args and types length mismatch', () => {
      const args = [1, 2];
      const types: ScType[] = ['u32'];
      expect(() => ScValConverter.encodeArgs(args, types)).toThrow(
        'Number of types must match number of arguments'
      );
    });
  });

  describe('toTypedScVal', () => {
    it('should convert to typed ScVal', () => {
      const result = ScValConverter.toScVal(42, 'u32');
      expect(result.switch()).toBe(xdr.ScValType.scvU32());
      expect(result.u32()).toBe(42);
    });

    it('should handle different numeric types', () => {
      const u64 = ScValConverter.toScVal(BigInt(100), 'u64');
      expect(u64.switch()).toBe(xdr.ScValType.scvU64());

      const f32 = ScValConverter.toScVal(3.14, 'f32');
      expect(f32.switch()).toBe(xdr.ScValType.scvF32());

      const bytes = ScValConverter.toScVal('48656c6c6f', 'bytes');
      expect(bytes.switch()).toBe(xdr.ScValType.scvBytes());
    });

    it('should handle option type', () => {
      const some = ScValConverter.toScVal(42, 'option');
      expect(some.switch()).toBe(xdr.ScValType.scvI32());

      const none = ScValConverter.toScVal(null, 'option');
      expect(none.switch()).toBe(xdr.ScValType.scvVoid());
    });
  });

  describe('fromTypedScVal', () => {
    it('should convert from typed ScVal', () => {
      const scVal = xdr.ScVal.scvU32(42);
      const result = ScValConverter.fromTypedScVal(scVal, 'u32');
      expect(result).toBe(42);
    });

    it('should return null for mismatched types', () => {
      const scVal = xdr.ScVal.scvString('hello');
      const result = ScValConverter.fromTypedScVal(scVal, 'u32');
      expect(result).toBeNull();
    });
  });

  describe('helper methods', () => {
    it('should create symbol ScVal', () => {
      const result = ScValConverter.toSymbol('test');
      expect(result.switch()).toBe(xdr.ScValType.scvSymbol());
      expect(result.symbol().toString()).toBe('test');
    });

    it('should create address ScVal', () => {
      const address =
        'GDQZ43L2QQ3B5OUP4QKA52L2AKYYG5ZC5LEJ2TFKX2LFDWLXRWERFW53';
      const result = ScValConverter.toAddress(address);
      expect(result.switch()).toBe(xdr.ScValType.scvAddress());
    });

    it('should create bytes ScVal', () => {
      const data = '48656c6c6f';
      const result = ScValConverter.toBytes(data);
      expect(result.switch()).toBe(xdr.ScValType.scvBytes());
      expect(Buffer.from(result.bytes()).toString('hex')).toBe(data);
    });
  });
});
