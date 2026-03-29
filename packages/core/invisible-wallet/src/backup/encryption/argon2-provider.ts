/**
 * @fileoverview Argon2 Key Derivation Provider
 * @description Argon2id implementation for enhanced security
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { BaseKDFProvider } from './kdf-provider.js';
import {
  KDFType,
  Argon2Params,
  KDFParams,
  DEFAULT_ARGON2_MEMORY_COST,
  DEFAULT_ARGON2_TIME_COST,
  DEFAULT_ARGON2_PARALLELISM,
} from '../types/backup-types.js';

const DEFAULT_HASH_LENGTH = 32;
const DEFAULT_SALT_LENGTH = 16;

export class Argon2Provider extends BaseKDFProvider {
  readonly type: KDFType = 'Argon2';

  async deriveKey(password: string, params?: Partial<Argon2Params>): Promise<Buffer> {
    const fullParams = this.mergeWithDefaults(params);
    const salt = Buffer.from(fullParams.salt, 'base64');

    const argon2Type = this.getArgon2Type(fullParams.type);

    const hash = await argon2.hash(password, {
      type: argon2Type,
      salt,
      memoryCost: fullParams.memoryCost,
      timeCost: fullParams.timeCost,
      parallelism: fullParams.parallelism,
      hashLength: fullParams.hashLength,
      raw: true,
    });

    return hash;
  }

  generateParams(): Argon2Params {
    return {
      salt: this.generateSalt(DEFAULT_SALT_LENGTH).toString('base64'),
      memoryCost: DEFAULT_ARGON2_MEMORY_COST,
      timeCost: DEFAULT_ARGON2_TIME_COST,
      parallelism: DEFAULT_ARGON2_PARALLELISM,
      hashLength: DEFAULT_HASH_LENGTH,
      type: 'argon2id',
    };
  }

  validateParams(params: KDFParams): params is Argon2Params {
    const argon2Params = params as Argon2Params;
    return (
      typeof argon2Params.salt === 'string' &&
      typeof argon2Params.memoryCost === 'number' &&
      argon2Params.memoryCost >= 1024 &&
      typeof argon2Params.timeCost === 'number' &&
      argon2Params.timeCost >= 1 &&
      typeof argon2Params.parallelism === 'number' &&
      argon2Params.parallelism >= 1 &&
      typeof argon2Params.hashLength === 'number' &&
      argon2Params.hashLength >= 16 &&
      ['argon2id', 'argon2i', 'argon2d'].includes(argon2Params.type)
    );
  }

  private mergeWithDefaults(params?: Partial<Argon2Params>): Argon2Params {
    const defaults = this.generateParams();
    return {
      salt: params?.salt ?? defaults.salt,
      memoryCost: params?.memoryCost ?? defaults.memoryCost,
      timeCost: params?.timeCost ?? defaults.timeCost,
      parallelism: params?.parallelism ?? defaults.parallelism,
      hashLength: params?.hashLength ?? defaults.hashLength,
      type: params?.type ?? defaults.type,
    };
  }

  private getArgon2Type(type: 'argon2id' | 'argon2i' | 'argon2d'): 0 | 1 | 2 {
    switch (type) {
      case 'argon2d':
        return argon2.argon2d;
      case 'argon2i':
        return argon2.argon2i;
      case 'argon2id':
      default:
        return argon2.argon2id;
    }
  }
}
