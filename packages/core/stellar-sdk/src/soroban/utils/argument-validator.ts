import { AbiType, ContractFunction, ScType } from '../types/contract-types.js';
import { ScValConverter } from './scval-converter.js';

export interface ArgumentValidationError {
  index: number;
  expected: string;
  received: string;
}

export interface ArgumentValidationResult {
  valid: boolean;
  errors: ArgumentValidationError[];
}

const INTEGER_RANGES: Record<string, [bigint, bigint]> = {
  u32: [0n, (1n << 32n) - 1n],
  i32: [-(1n << 31n), (1n << 31n) - 1n],
  u64: [0n, (1n << 64n) - 1n],
  i64: [-(1n << 63n), (1n << 63n) - 1n],
  u128: [0n, (1n << 128n) - 1n],
  i128: [-(1n << 127n), (1n << 127n) - 1n],
  u256: [0n, (1n << 256n) - 1n],
  i256: [-(1n << 255n), (1n << 255n) - 1n],
};

export function validateFunctionArguments(
  func: ContractFunction,
  args: unknown[],
  types: AbiType[] = []
): ArgumentValidationResult {
  const errors: ArgumentValidationError[] = [];
  const count = Math.max(func.inputs.length, args.length);

  for (let index = 0; index < count; index++) {
    const input = func.inputs[index];
    if (!input) {
      errors.push({
        index,
        expected: 'no argument',
        received: describeValue(args[index]),
      });
      continue;
    }

    if (index >= args.length) {
      errors.push({ index, expected: input.type, received: 'missing' });
      continue;
    }

    if (!matchesType(args[index], input.type, types)) {
      errors.push({
        index,
        expected: input.type,
        received: describeValue(args[index]),
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

export function formatArgumentValidationError(
  error: ArgumentValidationError
): string {
  return `Argument ${error.index}: expected ${error.expected}, received ${error.received}`;
}

function matchesType(value: unknown, expression: string, types: AbiType[]): boolean {
  const type = expression.trim();
  const tuple = parseTuple(type);
  if (tuple) {
    return (
      Array.isArray(value) &&
      value.length === tuple.length &&
      tuple.every((itemType, index) => matchesType(value[index], itemType, types))
    );
  }

  const generic = parseGeneric(type);
  const base = (generic?.name ?? type).toLowerCase();
  const parameters = generic?.parameters ?? [];

  if (Object.hasOwn(INTEGER_RANGES, base)) {
    return isInIntegerRange(value, base);
  }

  switch (base) {
    case 'void':
      return value === null || value === undefined;
    case 'bool':
      return typeof value === 'boolean';
    case 'address':
      return (
        typeof value === 'string' &&
        /^[GC][A-Z2-7]{55}$/.test(value) &&
        canEncode(value, 'address')
      );
    case 'symbol':
      return (
        typeof value === 'string' &&
        /^[a-zA-Z0-9_]{0,32}$/.test(value) &&
        canEncode(value, 'symbol')
      );
    case 'string':
      return typeof value === 'string';
    case 'bytes':
      return isBytes(value) && canEncode(value, 'bytes');
    case 'bytesn': {
      const length = parameters.length === 1 ? Number(parameters[0]) : NaN;
      return Number.isSafeInteger(length) && length >= 0 && isBytes(value) && value.byteLength === length;
    }
    case 'vec':
      return (
        Array.isArray(value) &&
        (parameters.length === 0 ||
          (parameters.length === 1 && value.every(item => matchesType(item, parameters[0], types))))
      );
    case 'set': {
      const values = value instanceof Set ? Array.from(value) : value;
      return (
        Array.isArray(values) &&
        (parameters.length === 0 ||
          (parameters.length === 1 && values.every(item => matchesType(item, parameters[0], types))))
      );
    }
    case 'map': {
      const entries = getMapEntries(value);
      return (
        entries !== null &&
        (parameters.length === 0 ||
          (parameters.length === 2 &&
            entries.every(
              ([key, item]) =>
                matchesType(key, parameters[0], types) &&
                matchesType(item, parameters[1], types)
            )))
      );
    }
    case 'option':
      return (
        value === null ||
        value === undefined ||
        parameters.length === 0 ||
        (parameters.length === 1 && matchesType(value, parameters[0], types))
      );
    case 'result':
      return matchesResult(value, parameters, types);
    case 'tuple':
      return (
        Array.isArray(value) &&
        (parameters.length === 0 ||
          (parameters.length === value.length &&
            parameters.every((itemType, index) => matchesType(value[index], itemType, types))))
      );
    default:
      return matchesUdt(value, type, types);
  }
}

function matchesUdt(value: unknown, name: string, types: AbiType[]): boolean {
  const definition = types.find(type => type.name === name);
  if (!definition) return false;

  if (definition.kind.toLowerCase() === 'struct') {
    if (!isRecord(value) || !definition.fields) return false;
    const expectedFields = new Set(definition.fields.map(field => field.name));
    return (
      Object.keys(value).length === expectedFields.size &&
      definition.fields.every(
        field =>
          Object.hasOwn(value, field.name) &&
          matchesType(value[field.name], field.type, types)
      )
    );
  }

  if (definition.kind.toLowerCase().includes('enum') || definition.kind.toLowerCase() === 'union') {
    const variants = definition.variants ?? [];
    if (typeof value === 'string') {
      return variants.some(variant => variant.name === value && !hasPayload(variant));
    }

    if (!isRecord(value)) return false;
    let variantName: string;
    let payload: unknown;
    if (typeof value.tag === 'string' && Object.hasOwn(value, 'value')) {
      variantName = value.tag;
      payload = value.value;
    } else {
      const keys = Object.keys(value);
      if (keys.length !== 1) return false;
      variantName = keys[0];
      payload = value[variantName];
    }

    const variant = variants.find(item => item.name === variantName);
    if (!variant) return false;
    if (variant.fields?.length) {
      if (!isRecord(payload)) return false;
      const expectedFields = new Set(variant.fields.map(field => field.name));
      return (
        Object.keys(payload).length === expectedFields.size &&
        variant.fields.every(
          field =>
            Object.hasOwn(payload, field.name) &&
            matchesType(payload[field.name], field.type, types)
        )
      );
    }
    if (variant.type) return matchesType(payload, variant.type, types);
    return payload === null || payload === undefined;
  }

  return false;
}

function matchesResult(value: unknown, parameters: string[], types: AbiType[]): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1 || parameters.length !== 2) return false;
  if (keys[0] === 'ok') return matchesType(value.ok, parameters[0], types);
  if (keys[0] === 'err') return matchesType(value.err, parameters[1], types);
  return false;
}

function hasPayload(variant: NonNullable<AbiType['variants']>[number]): boolean {
  return Boolean(variant.type || variant.fields?.length);
}

function parseTuple(type: string): string[] | null {
  if (!type.startsWith('(') || !type.endsWith(')')) return null;
  const contents = type.slice(1, -1).trim();
  return contents ? splitTypeParameters(contents) : [];
}

function parseGeneric(type: string): { name: string; parameters: string[] } | null {
  const open = type.indexOf('<');
  if (open < 1 || !type.endsWith('>')) return null;
  const name = type.slice(0, open).trim();
  const contents = type.slice(open + 1, -1).trim();
  return {
    name,
    parameters: contents ? splitTypeParameters(contents) : [],
  };
}

function splitTypeParameters(contents: string): string[] {
  const parameters: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < contents.length; index++) {
    const character = contents[index];
    if (character === '<' || character === '(') depth++;
    if (character === '>' || character === ')') depth--;
    if (character === ',' && depth === 0) {
      parameters.push(contents.slice(start, index).trim());
      start = index + 1;
    }
  }
  parameters.push(contents.slice(start).trim());
  return parameters;
}

function isInIntegerRange(value: unknown, type: string): boolean {
  let integer: bigint;
  try {
    if (typeof value === 'bigint') {
      integer = value;
    } else if (typeof value === 'number' && Number.isSafeInteger(value)) {
      integer = BigInt(value);
    } else if (typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value)) {
      integer = BigInt(value);
    } else {
      return false;
    }
  } catch {
    return false;
  }

  const [minimum, maximum] = INTEGER_RANGES[type];
  return integer >= minimum && integer <= maximum;
}

function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function getMapEntries(value: unknown): Array<[unknown, unknown]> | null {
  if (value instanceof Map) return Array.from(value.entries());
  if (!isRecord(value)) return null;
  return Object.entries(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canEncode(value: unknown, type: ScType): boolean {
  try {
    ScValConverter.toScVal(value, type);
    return true;
  } catch {
    return false;
  }
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    const rendered = JSON.stringify(value);
    return `string(${rendered.length > 42 ? `${rendered.slice(0, 39)}...` : rendered})`;
  }
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'bigint') return 'bigint';
  if (typeof value === 'boolean') return 'boolean';
  if (value instanceof Uint8Array) return `bytes(${value.byteLength})`;
  if (value instanceof Map) return `Map(${value.size})`;
  if (value instanceof Set) return `Set(${value.size})`;
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}