/**
 * @fileoverview Protocol factory service
 * @description Factory for creating DeFi protocol instances
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { IDefiProtocol, IProtocolFactory } from '../types/protocol-interface';
import { ProtocolConfig, ProtocolType } from '../types/defi-types';

/**
 * Protocol constructor type
 */
type ProtocolConstructor = new (config: ProtocolConfig) => IDefiProtocol;

/**
 * Protocol factory for creating protocol instances
 * @implements {IProtocolFactory}
 */
export class ProtocolFactory implements IProtocolFactory {
  private static instance: ProtocolFactory;
  private protocols: Map<string, ProtocolConstructor> = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {}

  /**
   * Get singleton instance
   * @returns {ProtocolFactory}
   */
  public static getInstance(): ProtocolFactory {
    if (!ProtocolFactory.instance) {
      ProtocolFactory.instance = new ProtocolFactory();
    }
    return ProtocolFactory.instance;
  }

  /**
   * Register a protocol implementation
   * @param {string} protocolId - Protocol identifier
   * @param {ProtocolConstructor} constructor - Protocol constructor
   */
  public register(protocolId: string, constructor: ProtocolConstructor): void {
    if (this.protocols.has(protocolId)) {
      throw new Error(`Protocol ${protocolId} is already registered`);
    }
    this.protocols.set(protocolId, constructor);
  }

  /**
   * Unregister a protocol implementation
   * @param {string} protocolId - Protocol identifier
   */
  public unregister(protocolId: string): void {
    this.protocols.delete(protocolId);
  }

  /**
   * Create a protocol instance
   * @param {ProtocolConfig} config - Protocol configuration
   * @returns {IDefiProtocol} Protocol instance
   * @throws {Error} If protocol is not registered
   */
  public createProtocol(config: ProtocolConfig): IDefiProtocol {
    const Constructor = this.protocols.get(config.protocolId);

    if (!Constructor) {
      throw new Error(
        `Protocol ${config.protocolId} is not registered. ` +
        `Available protocols: ${Array.from(this.protocols.keys()).join(', ')}`
      );
    }

    return new Constructor(config);
  }

  /**
   * Get supported protocol IDs
   * @returns {string[]} Array of protocol IDs
   */
  public getSupportedProtocols(): string[] {
    return Array.from(this.protocols.keys());
  }

  /**
   * Check if a protocol is registered
   * @param {string} protocolId - Protocol identifier
   * @returns {boolean} True if registered
   */
  public isProtocolRegistered(protocolId: string): boolean {
    return this.protocols.has(protocolId);
  }

  /**
   * Clear all registered protocols (mainly for testing)
   */
  public clear(): void {
    this.protocols.clear();
  }
}

/**
 * Get the global protocol factory instance
 * @returns {ProtocolFactory}
 */
export function getProtocolFactory(): ProtocolFactory {
  return ProtocolFactory.getInstance();
}
