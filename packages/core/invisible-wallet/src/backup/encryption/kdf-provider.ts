/**
 * @fileoverview KDF Provider Interface
 * @description Abstract interface for key derivation functions
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import { KDFType, KDFParams } from '../types/backup-types';

export interface IKDFProvider {
  readonly type: KDFType;
  deriveKey(password: string, params?: Partial<KDFParams>): Promise<Buffer>;
  generateParams(): KDFParams;
  validateParams(params: KDFParams): boolean;
}

export abstract class BaseKDFProvider implements IKDFProvider {
  abstract readonly type: KDFType;
  abstract deriveKey(password: string, params?: Partial<KDFParams>): Promise<Buffer>;
  abstract generateParams(): KDFParams;
  abstract validateParams(params: KDFParams): boolean;

  protected generateSalt(length: number = 16): Buffer {
    const crypto = require('crypto');
    return crypto.randomBytes(length);
  }
}
