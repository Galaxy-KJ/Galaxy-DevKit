/**
 * @fileoverview Session state management for Galaxy CLI interactive mode
 * @description Manages session state including network, wallet, and custom variables
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-28
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import NodeCache from 'node-cache';
import type {
  SessionState,
  SessionConfig,
  NetworkType,
} from '../../types/interactive-types.js';

/** Default session configuration */
const DEFAULT_SESSION_CONFIG: SessionConfig = {
  autoSave: true,
  timeout: 0, // No timeout by default
  statePath: path.join(os.homedir(), '.galaxy', 'session.json'),
};

/** Default session state */
const DEFAULT_SESSION_STATE: SessionState = {
  network: 'testnet',
  activeWallet: null,
  activeWalletName: null,
  workingDirectory: process.cwd(),
  startedAt: new Date(),
  lastCommandAt: null,
  commandCount: 0,
  variables: {},
};

/**
 * Session manager for interactive REPL mode
 * Handles state persistence, network switching, wallet context, and custom variables
 */
export class SessionManager {
  private state: SessionState;
  private config: SessionConfig;
  private cache: NodeCache;
  private eventListeners: Map<string, Set<(data?: any) => void>> = new Map();

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.state = { ...DEFAULT_SESSION_STATE };
    this.cache = new NodeCache({ stdTTL: this.config.timeout / 1000 || 0 });
  }

  /**
   * Initialize session, optionally loading from disk
   */
  async initialize(): Promise<void> {
    await this.ensureConfigDir();
    await this.loadState();
    this.state.startedAt = new Date();
    this.state.workingDirectory = process.cwd();
  }

  /**
   * Ensure the .galaxy config directory exists
   */
  private async ensureConfigDir(): Promise<void> {
    const configDir = path.dirname(this.config.statePath);
    await fs.ensureDir(configDir);
  }

  /**
   * Load session state from disk
   */
  private async loadState(): Promise<void> {
    try {
      if (await fs.pathExists(this.config.statePath)) {
        const savedState = await fs.readJson(this.config.statePath);
        // Merge saved state with defaults, preserving saved values
        this.state = {
          ...DEFAULT_SESSION_STATE,
          ...savedState,
          startedAt: new Date(),
          lastCommandAt: null,
          commandCount: 0,
        };
      }
    } catch {
      // Ignore errors, use defaults
    }
  }

  /**
   * Save session state to disk
   */
  async saveState(): Promise<void> {
    if (!this.config.autoSave) return;

    try {
      await this.ensureConfigDir();
      // Save only persistent state properties
      const persistentState = {
        network: this.state.network,
        activeWallet: this.state.activeWallet,
        activeWalletName: this.state.activeWalletName,
        variables: this.state.variables,
      };
      await fs.writeJson(this.config.statePath, persistentState, { spaces: 2 });
    } catch {
      // Ignore save errors
    }
  }

  /**
   * Get the current session state
   * Returns a deep copy to prevent external mutation
   */
  getState(): SessionState {
    return {
      ...this.state,
      startedAt: new Date(this.state.startedAt),
      lastCommandAt: this.state.lastCommandAt ? new Date(this.state.lastCommandAt) : null,
      variables: { ...this.state.variables },
    };
  }

  /**
   * Get the current network
   */
  getNetwork(): NetworkType {
    return this.state.network;
  }

  /**
   * Set the current network
   */
  async setNetwork(network: NetworkType): Promise<void> {
    const oldNetwork = this.state.network;
    this.state.network = network;
    await this.saveState();
    this.emit('network-change', { oldNetwork, newNetwork: network });
  }

  /**
   * Get the active wallet public key
   */
  getActiveWallet(): string | null {
    return this.state.activeWallet;
  }

  /**
   * Get the active wallet name
   */
  getActiveWalletName(): string | null {
    return this.state.activeWalletName;
  }

  /**
   * Set the active wallet
   */
  async setActiveWallet(
    publicKey: string | null,
    name: string | null = null
  ): Promise<void> {
    const oldWallet = this.state.activeWallet;
    this.state.activeWallet = publicKey;
    this.state.activeWalletName = name;
    await this.saveState();
    this.emit('wallet-change', { oldWallet, newWallet: publicKey, name });
  }

  /**
   * Get a session variable
   */
  getVariable(key: string): string | undefined {
    return this.state.variables[key];
  }

  /**
   * Set a session variable
   */
  async setVariable(key: string, value: string): Promise<void> {
    this.state.variables[key] = value;
    await this.saveState();
    this.emit('session-change', { type: 'variable-set', key, value });
  }

  /**
   * Unset (remove) a session variable
   */
  async unsetVariable(key: string): Promise<boolean> {
    if (key in this.state.variables) {
      delete this.state.variables[key];
      await this.saveState();
      this.emit('session-change', { type: 'variable-unset', key });
      return true;
    }
    return false;
  }

  /**
   * Get all session variables
   */
  getVariables(): Record<string, string> {
    return { ...this.state.variables };
  }

  /**
   * Record a command execution
   */
  recordCommand(): void {
    this.state.lastCommandAt = new Date();
    this.state.commandCount++;
  }

  /**
   * Get session statistics
   */
  getStats(): {
    duration: number;
    commandCount: number;
    lastCommandAt: Date | null;
  } {
    const now = new Date();
    const duration = now.getTime() - this.state.startedAt.getTime();
    return {
      duration,
      commandCount: this.state.commandCount,
      lastCommandAt: this.state.lastCommandAt,
    };
  }

  /**
   * Set a cached value with TTL
   */
  setCache(key: string, value: any, ttl?: number): void {
    if (ttl !== undefined) {
      this.cache.set(key, value, ttl);
    } else {
      this.cache.set(key, value);
    }
  }

  /**
   * Get a cached value
   */
  getCache<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  /**
   * Clear all cached values
   */
  clearCache(): void {
    this.cache.flushAll();
  }

  /**
   * Subscribe to session events
   */
  on(event: string, handler: (data?: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from session events
   */
  off(event: string, handler: (data?: any) => void): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  /**
   * Emit a session event
   */
  private emit(event: string, data?: any): void {
    this.eventListeners.get(event)?.forEach((handler) => {
      handler(data);
    });
  }

  /**
   * Reset session to defaults
   */
  async reset(): Promise<void> {
    this.state = {
      ...DEFAULT_SESSION_STATE,
      startedAt: new Date(),
      workingDirectory: process.cwd(),
      variables: {}, // Create new empty object to avoid shared reference
    };
    this.cache.flushAll();
    await this.saveState();
    this.emit('session-change', { type: 'reset' });
  }

  /**
   * Format session info for display
   */
  formatInfo(): string {
    const stats = this.getStats();
    const durationMinutes = Math.floor(stats.duration / 60000);
    const durationSeconds = Math.floor((stats.duration % 60000) / 1000);

    const lines = [
      `Network: ${this.state.network}`,
      `Wallet: ${this.state.activeWalletName || this.state.activeWallet || 'none'}`,
      `Working Directory: ${this.state.workingDirectory}`,
      `Session Duration: ${durationMinutes}m ${durationSeconds}s`,
      `Commands Executed: ${stats.commandCount}`,
    ];

    const varKeys = Object.keys(this.state.variables);
    if (varKeys.length > 0) {
      lines.push('Variables:');
      varKeys.forEach((key) => {
        lines.push(`  ${key}=${this.state.variables[key]}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Get the prompt prefix based on current state
   */
  getPromptPrefix(): string {
    const parts: string[] = [];

    // Add network indicator if not testnet
    if (this.state.network !== 'testnet') {
      parts.push(`[${this.state.network}]`);
    }

    // Add wallet indicator if set
    if (this.state.activeWalletName) {
      parts.push(`(${this.state.activeWalletName})`);
    } else if (this.state.activeWallet) {
      // Truncate public key
      const truncated = `${this.state.activeWallet.slice(0, 4)}...${this.state.activeWallet.slice(-4)}`;
      parts.push(`(${truncated})`);
    }

    return parts.length > 0 ? parts.join(' ') + ' ' : '';
  }
}

/** Singleton session manager instance */
let sessionInstance: SessionManager | null = null;

/**
 * Get the singleton session manager instance
 */
export function getSessionManager(
  config?: Partial<SessionConfig>
): SessionManager {
  if (!sessionInstance) {
    sessionInstance = new SessionManager(config);
  }
  return sessionInstance;
}

/**
 * Reset the singleton session manager (useful for testing)
 */
export function resetSessionManager(): void {
  sessionInstance = null;
}
