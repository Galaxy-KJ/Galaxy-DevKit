/**
 * @fileoverview ABI Parser
 * @description Parse and work with Soroban contract ABIs
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  ContractAbi,
  ContractFunction,
  ContractEvent,
  ScType,
} from '../types/contract-types';

export class AbiParser {
  /**
   * Parse ABI from contract specification
   */
  static parseFromSpec(spec: any): ContractAbi {
    return {
      name: spec.name || '',
      version: spec.version || '1.0.0',
      functions: this.parseFunctions(spec.functions || []),
      types: this.parseTypes(spec.types || []),
    };
  }

  /**
   * Parse functions from ABI
   */
  static parseFunctions(functions: any[]): ContractFunction[] {
    return functions.map(func => ({
      name: func.name || '',
      inputs: this.parseArguments(func.inputs || []),
      outputs: this.parseReturnTypes(func.outputs || []),
    }));
  }

  /**
   * Parse events from ABI
   */
  static parseEvents(events: any[]): ContractEvent[] {
    return events.map(event => ({
      name: event.name || '',
      topics: this.parseEventTopics(event.topics || []),
      data: this.parseEventData(event.data || []),
    }));
  }

  /**
   * Parse function arguments
   */
  static parseArguments(args: any[]): Array<{ name: string; type: ScType }> {
    return args.map(arg => ({
      name: arg.name || '',
      type: this.parseScType(arg.type),
    }));
  }

  /**
   * Parse return types
   */
  static parseReturnTypes(types: any[]): ScType[] {
    return types.map(type => this.parseScType(type));
  }

  /**
   * Parse event topics
   */
  static parseEventTopics(topics: any[]): ScType[] {
    return topics.map(topic => this.parseScType(topic));
  }

  /**
   * Parse event data
   */
  static parseEventData(data: any[]): ScType[] {
    return data.map(item => this.parseScType(item));
  }

  /**
   * Parse ScType from string
   */
  static parseScType(typeStr: string): ScType {
    const normalizedType = typeStr.toLowerCase();

    switch (normalizedType) {
      case 'void':
        return 'void';
      case 'bool':
        return 'bool';
      case 'u32':
        return 'u32';
      case 'i32':
        return 'i32';
      case 'u64':
        return 'u64';
      case 'i64':
        return 'i64';
      case 'u128':
        return 'u128';
      case 'i128':
        return 'i128';
      case 'u256':
        return 'u256';
      case 'i256':
        return 'i256';
      case 'f32':
        return 'f32';
      case 'f64':
        return 'f64';
      case 'bytes':
        return 'bytes';
      case 'string':
        return 'string';
      case 'symbol':
        return 'symbol';
      case 'address':
        return 'address';
      case 'option':
        return 'option';
      case 'result':
        return 'result';
      case 'vec':
        return 'vec';
      case 'map':
        return 'map';
      case 'set':
        return 'set';
      case 'tuple':
        return 'tuple';
      default:
        // Handle generic types like Vec<u32>, Map<string, u64>, etc.
        if (normalizedType.startsWith('vec<')) {
          return 'vec';
        }
        if (normalizedType.startsWith('map<')) {
          return 'map';
        }
        if (normalizedType.startsWith('set<')) {
          return 'set';
        }
        if (normalizedType.startsWith('option<')) {
          return 'option';
        }
        if (normalizedType.startsWith('result<')) {
          return 'result';
        }
        throw new Error(`Unknown ScType: ${typeStr}`);
    }
  }

  /**
   * Build function signature
   */
  static buildFunctionSignature(func: ContractFunction): string {
    const args = func.inputs
      .map(input => `${input.name}: ${input.type}`)
      .join(', ');
    const returns =
      func.outputs.length === 1
        ? func.outputs[0]
        : `(${func.outputs.join(', ')})`;
    return `${func.name}(${args}) -> ${returns}`;
  }

  /**
   * Get function by name
   */
  static getFunctionByName(
    abi: ContractAbi,
    name: string
  ): ContractFunction | undefined {
    return abi.functions.find(func => func.name === name);
  }

  /**
   * Get event by name
   */
  static getEventByName(
    events: ContractEvent[],
    name: string
  ): ContractEvent | undefined {
    return events.find(event => event.name === name);
  }

  /**
   * Validate arguments against function signature
   */
  static validateArguments(func: ContractFunction, args: any[]): boolean {
    if (func.inputs.length !== args.length) {
      return false;
    }

    // Type validation would require more complex logic
    // For now, just check length
    return true;
  }

  /**
   * Extract generic type parameters
   */
  static extractGenericTypeParameters(typeStr: string): string[] {
    const match = typeStr.match(/<(.+)>/);
    if (!match) {
      return [];
    }

    return match[1].split(',').map(param => param.trim());
  }

  /**
   * Check if type is generic
   */
  static isGenericType(typeStr: string): boolean {
    return typeStr.includes('<') && typeStr.includes('>');
  }

  /**
   * Get base type from generic type
   */
  static getBaseGenericType(typeStr: string): ScType {
    const baseType = typeStr.split('<')[0].toLowerCase();
    return this.parseScType(baseType);
  }

  /**
   * Convert ABI to JSON schema
   */
  static abiToJsonSchema(abi: ContractAbi): any {
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: abi.name,
      description: `Contract ABI version ${abi.version}`,
      type: 'object',
      properties: {
        name: { type: 'string', const: abi.name },
        version: { type: 'string', const: abi.version },
        functions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              inputs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                  },
                  required: ['name', 'type'],
                },
              },
              outputs: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['name', 'inputs', 'outputs'],
          },
        },
        types: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              kind: { type: 'string' },
              fields: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                  },
                  required: ['name', 'type'],
                },
              },
              generics: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['name', 'kind'],
          },
        },
      },
      required: ['name', 'version', 'functions', 'types'],
    };
  }

  /**
   * Merge multiple ABIs
   */
  static mergeAbis(abis: ContractAbi[]): ContractAbi {
    if (abis.length === 0) {
      throw new Error('Cannot merge empty ABI list');
    }

    const firstAbi = abis[0];
    const mergedAbi: ContractAbi = {
      name: firstAbi.name,
      version: firstAbi.version,
      functions: [...firstAbi.functions],
      types: [...firstAbi.types],
    };

    for (let i = 1; i < abis.length; i++) {
      const abi = abis[i];
      mergedAbi.functions.push(...abi.functions);
      mergedAbi.types.push(...abi.types);
    }

    // Remove duplicates
    mergedAbi.functions = this.removeDuplicateFunctions(mergedAbi.functions);
    mergedAbi.types = this.removeDuplicateTypes(mergedAbi.types);

    return mergedAbi;
  }

  /**
   * Remove duplicate functions
   */
  private static removeDuplicateFunctions(
    functions: ContractFunction[]
  ): ContractFunction[] {
    const seen = new Set<string>();
    return functions.filter(func => {
      const signature = this.buildFunctionSignature(func);
      if (seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    });
  }

  /**
   * Remove duplicate types
   */
  private static removeDuplicateTypes(types: any[]): any[] {
    const seen = new Set<string>();
    return types.filter(type => {
      if (seen.has(type.name)) {
        return false;
      }
      seen.add(type.name);
      return true;
    });
  }
}
