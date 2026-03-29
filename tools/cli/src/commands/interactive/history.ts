/**
 * @fileoverview Command history management for Galaxy CLI interactive mode
 * @description Manages command history with persistence, search, and navigation
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-28
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type {
  HistoryEntry,
  HistoryConfig,
  HistorySearchResult,
} from '../../types/interactive-types.js';

/** Default history configuration */
const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  maxEntries: 100,
  historyPath: path.join(os.homedir(), '.galaxy', 'history'),
  persist: true,
  deduplicate: true,
};

/**
 * History manager for interactive REPL mode
 * Handles command history storage, retrieval, search, and persistence
 */
export class HistoryManager {
  private entries: HistoryEntry[] = [];
  private config: HistoryConfig;
  private currentIndex: number = -1;
  private tempCommand: string = '';

  constructor(config: Partial<HistoryConfig> = {}) {
    this.config = { ...DEFAULT_HISTORY_CONFIG, ...config };
  }

  /**
   * Initialize history, loading from disk if persistence is enabled
   */
  async initialize(): Promise<void> {
    if (this.config.persist) {
      await this.load();
    }
  }

  /**
   * Ensure the history directory exists
   */
  private async ensureHistoryDir(): Promise<void> {
    const historyDir = path.dirname(this.config.historyPath);
    await fs.ensureDir(historyDir);
  }

  /**
   * Load history from disk
   */
  async load(): Promise<void> {
    try {
      if (await fs.pathExists(this.config.historyPath)) {
        const content = await fs.readFile(this.config.historyPath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        this.entries = lines.map((line) => {
          try {
            const parsed = JSON.parse(line);
            // Reconstruct Date object from ISO string
            return {
              ...parsed,
              timestamp: new Date(parsed.timestamp),
            } as HistoryEntry;
          } catch {
            // Legacy format: just the command string
            return {
              command: line,
              timestamp: new Date(),
              success: true,
            };
          }
        });

        // Trim to max entries
        if (this.entries.length > this.config.maxEntries) {
          this.entries = this.entries.slice(-this.config.maxEntries);
        }
      }
    } catch {
      // Ignore load errors, start with empty history
      this.entries = [];
    }
  }

  /**
   * Save history to disk
   */
  async save(): Promise<void> {
    if (!this.config.persist) return;

    try {
      await this.ensureHistoryDir();
      const content = this.entries.map((entry) => JSON.stringify(entry)).join('\n');
      await fs.writeFile(this.config.historyPath, content + '\n', 'utf-8');
    } catch {
      // Ignore save errors
    }
  }

  /**
   * Add a command to history
   */
  async add(command: string, success: boolean = true, duration?: number): Promise<void> {
    const trimmedCommand = command.trim();

    // Don't add empty commands
    if (!trimmedCommand) return;

    // Deduplicate consecutive identical commands
    if (this.config.deduplicate && this.entries.length > 0) {
      const lastEntry = this.entries[this.entries.length - 1];
      if (lastEntry.command === trimmedCommand) {
        // Update the last entry instead of adding duplicate
        lastEntry.timestamp = new Date();
        lastEntry.success = success;
        lastEntry.duration = duration;
        await this.save();
        return;
      }
    }

    const entry: HistoryEntry = {
      command: trimmedCommand,
      timestamp: new Date(),
      success,
      duration,
    };

    this.entries.push(entry);

    // Trim to max entries
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    // Reset navigation index
    this.currentIndex = -1;
    this.tempCommand = '';

    await this.save();
  }

  /**
   * Get all history entries
   */
  getAll(): HistoryEntry[] {
    return [...this.entries];
  }

  /**
   * Get the most recent N entries
   */
  getRecent(count: number = 10): HistoryEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Get entry at specific index (0 = oldest)
   */
  getAt(index: number): HistoryEntry | undefined {
    return this.entries[index];
  }

  /**
   * Get the total number of history entries
   */
  get length(): number {
    return this.entries.length;
  }

  /**
   * Navigate to previous command (arrow up)
   * @param currentInput Current input in the prompt
   * @returns Previous command or current input if at start
   */
  previous(currentInput: string = ''): string {
    if (this.entries.length === 0) return currentInput;

    // Save current input if starting navigation
    if (this.currentIndex === -1) {
      this.tempCommand = currentInput;
    }

    // Move to previous (older) entry
    if (this.currentIndex < this.entries.length - 1) {
      this.currentIndex++;
    }

    const entry = this.entries[this.entries.length - 1 - this.currentIndex];
    return entry?.command || currentInput;
  }

  /**
   * Navigate to next command (arrow down)
   * @returns Next command or saved temp command if at end
   */
  next(): string {
    if (this.currentIndex <= 0) {
      this.currentIndex = -1;
      return this.tempCommand;
    }

    this.currentIndex--;
    const entry = this.entries[this.entries.length - 1 - this.currentIndex];
    return entry?.command || this.tempCommand;
  }

  /**
   * Reset navigation state
   */
  resetNavigation(): void {
    this.currentIndex = -1;
    this.tempCommand = '';
  }

  /**
   * Search history for matching commands (Ctrl+R style)
   * @param query Search query
   * @returns Matching entries (newest first)
   */
  search(query: string): HistorySearchResult {
    if (!query) {
      return { matches: [], query, selectedIndex: 0 };
    }

    const lowerQuery = query.toLowerCase();
    const matches = this.entries
      .filter((entry) => entry.command.toLowerCase().includes(lowerQuery))
      .reverse(); // Newest first

    return {
      matches,
      query,
      selectedIndex: 0,
    };
  }

  /**
   * Get commands that start with a prefix (for autocomplete)
   * @param prefix Command prefix
   * @returns Matching commands (unique, newest first)
   */
  getByPrefix(prefix: string): string[] {
    if (!prefix) return [];

    const lowerPrefix = prefix.toLowerCase();
    const seen = new Set<string>();
    const results: string[] = [];

    // Iterate from newest to oldest
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const command = this.entries[i].command;
      if (
        command.toLowerCase().startsWith(lowerPrefix) &&
        !seen.has(command)
      ) {
        seen.add(command);
        results.push(command);
      }
    }

    return results;
  }

  /**
   * Clear all history
   */
  async clear(): Promise<void> {
    this.entries = [];
    this.currentIndex = -1;
    this.tempCommand = '';

    if (this.config.persist) {
      try {
        await fs.remove(this.config.historyPath);
      } catch {
        // Ignore removal errors
      }
    }
  }

  /**
   * Remove a specific entry by index
   */
  async removeAt(index: number): Promise<boolean> {
    if (index < 0 || index >= this.entries.length) {
      return false;
    }

    this.entries.splice(index, 1);
    await this.save();
    return true;
  }

  /**
   * Format history for display
   * @param count Number of entries to show
   * @param showTimestamp Whether to show timestamps
   */
  format(count?: number, showTimestamp: boolean = false): string {
    const entries = count ? this.getRecent(count) : this.entries;
    const startIndex = this.entries.length - entries.length;

    return entries
      .map((entry, i) => {
        const index = startIndex + i + 1;
        const status = entry.success ? ' ' : '!';
        const timestamp = showTimestamp
          ? ` [${entry.timestamp.toISOString()}]`
          : '';
        return `${index.toString().padStart(4)}${status} ${entry.command}${timestamp}`;
      })
      .join('\n');
  }

  /**
   * Export history to JSON
   */
  toJSON(): HistoryEntry[] {
    return this.entries.map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    }));
  }

  /**
   * Import history from JSON
   */
  async fromJSON(entries: HistoryEntry[]): Promise<void> {
    this.entries = entries.slice(-this.config.maxEntries).map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    }));
    await this.save();
  }
}

/** Singleton history manager instance */
let historyInstance: HistoryManager | null = null;

/**
 * Get the singleton history manager instance
 */
export function getHistoryManager(
  config?: Partial<HistoryConfig>
): HistoryManager {
  if (!historyInstance) {
    historyInstance = new HistoryManager(config);
  }
  return historyInstance;
}

/**
 * Reset the singleton history manager (useful for testing)
 */
export function resetHistoryManager(): void {
  historyInstance = null;
}
