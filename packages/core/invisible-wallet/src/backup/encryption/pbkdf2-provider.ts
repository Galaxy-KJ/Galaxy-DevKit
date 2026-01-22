/**
 * @fileoverview PBKDF2 Key Derivation Provider
 * @description PBKDF2 implementation wrapping existing encryption utils
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import * as crypto from 'crypto';
import { BaseKDFProvider } from './kdf-provider';
import {
  KDFType,
  PBKDF2Params,
  KDFParams,
  DEFAULT_PBKDF2_ITERATIONS,
} from '../types/backup-types';

const DEFAULT_KEY_LENGTH = 32;
const DEFAULT_SALT_LENGTH = 16;
const DEFAULT_DIGEST = 'sha256';

export class PBKDF2Provider extends BaseKDFProvider {
  readonly type: KDFType = 'PBKDF2';

  async deriveKey(password: string, params?: Partial<PBKDF2Params>): Promise<Buffer> {
    const fullParams = this.mergeWithDefaults(params);
    const salt = Buffer.from(fullParams.salt, 'base64');

    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        fullParams.iterations,
        fullParams.keyLength,
        fullParams.digest,
        (err, derivedKey) => {
          if (err) {
            reject(err);
          } else {
            resolve(derivedKey);
          }
        }
      );
    });
  }

  deriveKeySync(password: string, params?: Partial<PBKDF2Params>): Buffer {
    const fullParams = this.mergeWithDefaults(params);
    const salt = Buffer.from(fullParams.salt, 'base64');

    return crypto.pbkdf2Sync(
      password,
      salt,
      fullParams.iterations,
      fullParams.keyLength,
      fullParams.digest
    );
  }

  generateParams(): PBKDF2Params {
    return {
      salt: this.generateSalt(DEFAULT_SALT_LENGTH).toString('base64'),
      iterations: DEFAULT_PBKDF2_ITERATIONS,
      keyLength: DEFAULT_KEY_LENGTH,
      digest: DEFAULT_DIGEST,
    };
  }

  validateParams(params: KDFParams): params is PBKDF2Params {
    const pbkdf2Params = params as PBKDF2Params;
    return (
      typeof pbkdf2Params.salt === 'string' &&
      typeof pbkdf2Params.iterations === 'number' &&
      pbkdf2Params.iterations >= 10000 &&
      typeof pbkdf2Params.keyLength === 'number' &&
      pbkdf2Params.keyLength >= 16 &&
      typeof pbkdf2Params.digest === 'string' &&
      ['sha256', 'sha512', 'sha384'].includes(pbkdf2Params.digest)
    );
  }

  private mergeWithDefaults(params?: Partial<PBKDF2Params>): PBKDF2Params {
    const defaults = this.generateParams();
    return {
      salt: params?.salt ?? defaults.salt,
      iterations: params?.iterations ?? defaults.iterations,
      keyLength: params?.keyLength ?? defaults.keyLength,
      digest: params?.digest ?? defaults.digest,
    };
  }
}
