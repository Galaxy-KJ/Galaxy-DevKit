import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { AbiParser } from '../soroban/utils/abi-parser.js';
import { FunctionSignatureBuilder } from '../soroban/utils/function-signature-builder.js';
import { AbiType, ContractFunction } from '../soroban/types/contract-types.js';

const address = Keypair.random().publicKey();
const contractAddress = StrKey.encodeContract(Buffer.alloc(32, 1));

const typeCases: Array<{
  name: string;
  type: string;
  valid: unknown;
  invalid: unknown;
}> = [
  { name: 'u32', type: 'u32', valid: 4294967295, invalid: -1 },
  { name: 'i32', type: 'i32', valid: -2147483648, invalid: 2147483648 },
  {
    name: 'u64',
    type: 'u64',
    valid: '18446744073709551615',
    invalid: 18446744073709551616n,
  },
  {
    name: 'i64',
    type: 'i64',
    valid: '-9223372036854775808',
    invalid: '-9223372036854775809',
  },
  {
    name: 'u128',
    type: 'u128',
    valid: '340282366920938463463374607431768211455',
    invalid: '340282366920938463463374607431768211456',
  },
  {
    name: 'i128',
    type: 'i128',
    valid: '-170141183460469231731687303715884105728',
    invalid: '-170141183460469231731687303715884105729',
  },
  {
    name: 'u256',
    type: 'u256',
    valid: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
    invalid: '115792089237316195423570985008687907853269984665640564039457584007913129639936',
  },
  {
    name: 'i256',
    type: 'i256',
    valid: '-57896044618658097711785492504343953926634992332820282019728792003956564819968',
    invalid: '-57896044618658097711785492504343953926634992332820282019728792003956564819969',
  },
  { name: 'bool', type: 'bool', valid: true, invalid: 'true' },
  { name: 'Address', type: 'Address', valid: address, invalid: 'GINVALID' },
  { name: 'Symbol', type: 'Symbol', valid: 'transfer_1', invalid: 'bad-symbol' },
  { name: 'String', type: 'String', valid: 'hello', invalid: 42 },
  { name: 'Bytes', type: 'Bytes', valid: new Uint8Array([1, 2]), invalid: '0102' },
  {
    name: 'BytesN',
    type: 'BytesN<32>',
    valid: new Uint8Array(32),
    invalid: new Uint8Array(31),
  },
  { name: 'Vec', type: 'Vec<u32>', valid: [1, 2], invalid: [1, 'two'] },
  {
    name: 'Map',
    type: 'Map<String, u32>',
    valid: new Map([['one', 1]]),
    invalid: new Map([['one', 'one']]),
  },
  { name: 'Option', type: 'Option<u32>', valid: null, invalid: 'none' },
  {
    name: 'tuple',
    type: '(u32, Address)',
    valid: [1, address],
    invalid: [1, 'GINVALID'],
  },
];

function functionWithType(type: string): ContractFunction {
  return { name: 'test', inputs: [{ name: 'value', type }], outputs: [] };
}

describe('AbiParser argument validation', () => {
  it.each(typeCases)('$name accepts valid values and rejects invalid values', ({ type, valid, invalid }) => {
    const func = functionWithType(AbiParser.parseScType(type));

    expect(AbiParser.validateArguments(func, [valid]).valid).toBe(true);
    expect(AbiParser.validateArguments(func, [invalid]).valid).toBe(false);
    expect(AbiParser.validateArgumentsBoolean(func, [valid])).toBe(true);
    expect(AbiParser.validateArgumentsBoolean(func, [invalid])).toBe(false);

    const result = AbiParser.validateArgumentsDetailed(func, [invalid]);
    expect(result.errors[0]).toMatchObject({
      index: 0,
      expected: func.inputs[0].type,
    });
    expect(result.errors[0].received).toBeTruthy();
  });

  it('validates struct fields and enum variants from the parsed contract spec', () => {
    const abi = AbiParser.parseFromSpec({
      name: 'Example',
      functions: [{ name: 'set_profile', inputs: [{ name: 'profile', type: 'Profile' }] }],
      types: [
        {
          name: 'Profile',
          kind: 'struct',
          fields: [
            { name: 'name', type: 'String' },
            { name: 'age', type: 'u32' },
          ],
        },
        {
          name: 'State',
          kind: 'enum',
          cases: [{ name: 'Ready' }, { name: 'Count', type: 'u32' }],
        },
      ],
    });
    const profileFunction = abi.functions[0];
    const profile: AbiType[] = abi.types;

    expect(
      AbiParser.validateArgumentsDetailed(
        profileFunction,
        [{ name: 'Ada', age: 37 }],
        profile
      ).valid
    ).toBe(true);
    expect(
      AbiParser.validateArgumentsDetailed(
        profileFunction,
        [{ name: 'Ada', age: 'thirty-seven' }],
        profile
      ).errors[0]
    ).toMatchObject({ index: 0, expected: 'Profile' });

    const stateFunction = functionWithType('State');
    expect(AbiParser.validateArguments(stateFunction, ['Ready'], profile).valid).toBe(true);
    expect(AbiParser.validateArguments(stateFunction, [{ Count: 3 }], profile).valid).toBe(true);
    expect(AbiParser.validateArguments(stateFunction, [{ Count: 'three' }], profile).valid).toBe(false);
  });

  it('accepts G and C StrKeys as addresses and rejects other StrKey versions', () => {
    const func = functionWithType('Address');

    expect(AbiParser.validateArguments(func, [address]).valid).toBe(true);
    expect(AbiParser.validateArguments(func, [contractAddress]).valid).toBe(true);
    expect(
      AbiParser.validateArguments(
        func,
        [StrKey.encodeEd25519SecretSeed(Buffer.alloc(32, 1))]
      ).valid
    ).toBe(false);
  });

  it('reports argument index and expected type in the legacy signature-builder messages', () => {
    const validation = FunctionSignatureBuilder.validateArguments(
      functionWithType('i128'),
      ['not-an-integer']
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('Argument 0');
    expect(validation.errors[0]).toContain('expected i128');
    expect(
      FunctionSignatureBuilder.validateArgumentsDetailed(
        functionWithType('i128'),
        ['not-an-integer']
      ).errors[0]
    ).toMatchObject({ index: 0, expected: 'i128' });
  });

  it('reports missing and unexpected arguments with structured errors', () => {
    const func = functionWithType('bool');

    expect(AbiParser.validateArgumentsDetailed(func, []).errors[0]).toMatchObject({
      index: 0,
      expected: 'bool',
      received: 'missing',
    });
    expect(AbiParser.validateArgumentsDetailed({ ...func, inputs: [] }, [true]).errors[0]).toMatchObject({
      index: 0,
      expected: 'no argument',
      received: 'boolean',
    });
  });

  it('rejects a container value with the wrong outer shape', () => {
    expect(
      AbiParser.validateArguments(functionWithType('Map<String, u32>'), [[['one', 1]]]).valid
    ).toBe(false);
    expect(
      AbiParser.validateArguments(functionWithType('Vec<u32>'), ['not-an-array']).valid
    ).toBe(false);
  });
});