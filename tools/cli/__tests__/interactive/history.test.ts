/**
 * @fileoverview Tests for command history management
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  HistoryManager,
  getHistoryManager,
  resetHistoryManager,
} from '../../src/commands/interactive/history';

describe('HistoryManager', () => {
  let tmpDir: string;
  let historyPath: string;

  beforeEach(() => {
    resetHistoryManager();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'galaxy-history-'));
    historyPath = path.join(tmpDir, 'history');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  describe('basic operations', () => {
    it('starts with empty history', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();
      expect(manager.length).toBe(0);
      expect(manager.getAll()).toEqual([]);
    });

    it('adds commands to history', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('help');
      await manager.add('wallet create');

      expect(manager.length).toBe(2);
      expect(manager.getAll()[0].command).toBe('help');
      expect(manager.getAll()[1].command).toBe('wallet create');
    });

    it('trims whitespace from commands', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('  help  ');
      expect(manager.getAll()[0].command).toBe('help');
    });

    it('ignores empty commands', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('');
      await manager.add('   ');

      expect(manager.length).toBe(0);
    });

    it('records success status and duration', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('failing command', false, 150);
      await manager.add('successful command', true, 50);

      expect(manager.getAll()[0].success).toBe(false);
      expect(manager.getAll()[0].duration).toBe(150);
      expect(manager.getAll()[1].success).toBe(true);
      expect(manager.getAll()[1].duration).toBe(50);
    });
  });

  describe('deduplication', () => {
    it('deduplicates consecutive identical commands', async () => {
      const manager = new HistoryManager({
        historyPath,
        persist: false,
        deduplicate: true,
      });
      await manager.initialize();

      await manager.add('help');
      await manager.add('help');
      await manager.add('help');

      expect(manager.length).toBe(1);
    });

    it('allows non-consecutive duplicate commands', async () => {
      const manager = new HistoryManager({
        historyPath,
        persist: false,
        deduplicate: true,
      });
      await manager.initialize();

      await manager.add('help');
      await manager.add('exit');
      await manager.add('help');

      expect(manager.length).toBe(3);
    });

    it('can disable deduplication', async () => {
      const manager = new HistoryManager({
        historyPath,
        persist: false,
        deduplicate: false,
      });
      await manager.initialize();

      await manager.add('help');
      await manager.add('help');

      expect(manager.length).toBe(2);
    });
  });

  describe('max entries', () => {
    it('respects max entries limit', async () => {
      const manager = new HistoryManager({
        historyPath,
        persist: false,
        maxEntries: 3,
      });
      await manager.initialize();

      await manager.add('cmd1');
      await manager.add('cmd2');
      await manager.add('cmd3');
      await manager.add('cmd4');
      await manager.add('cmd5');

      expect(manager.length).toBe(3);
      expect(manager.getAll()[0].command).toBe('cmd3');
      expect(manager.getAll()[2].command).toBe('cmd5');
    });
  });

  describe('navigation', () => {
    it('navigates through history with previous()', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('cmd1');
      await manager.add('cmd2');
      await manager.add('cmd3');

      expect(manager.previous()).toBe('cmd3');
      expect(manager.previous()).toBe('cmd2');
      expect(manager.previous()).toBe('cmd1');
      // Should stay at oldest
      expect(manager.previous()).toBe('cmd1');
    });

    it('navigates forward with next()', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('cmd1');
      await manager.add('cmd2');
      await manager.add('cmd3');

      manager.previous();
      manager.previous();
      manager.previous();

      expect(manager.next()).toBe('cmd2');
      expect(manager.next()).toBe('cmd3');
      // Should return to temp command (empty)
      expect(manager.next()).toBe('');
    });

    it('preserves temporary input during navigation', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('cmd1');
      await manager.add('cmd2');

      // Start with partial input
      expect(manager.previous('partial')).toBe('cmd2');
      expect(manager.previous('partial')).toBe('cmd1');
      // Return to original input
      expect(manager.next()).toBe('cmd2');
      expect(manager.next()).toBe('partial');
    });

    it('resets navigation after adding new command', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('cmd1');
      await manager.add('cmd2');

      manager.previous();
      manager.previous();

      await manager.add('cmd3');

      // Should start from newest again
      expect(manager.previous()).toBe('cmd3');
    });
  });

  describe('search', () => {
    it('searches history by substring', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('wallet create');
      await manager.add('oracle price XLM');
      await manager.add('wallet list');
      await manager.add('oracle sources');

      const walletResults = manager.search('wallet');
      expect(walletResults.matches).toHaveLength(2);
      // Newest first
      expect(walletResults.matches[0].command).toBe('wallet list');
      expect(walletResults.matches[1].command).toBe('wallet create');

      const oracleResults = manager.search('oracle');
      expect(oracleResults.matches).toHaveLength(2);
    });

    it('returns empty for no matches', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('wallet create');

      const results = manager.search('nonexistent');
      expect(results.matches).toHaveLength(0);
    });

    it('is case-insensitive', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('Wallet Create');
      await manager.add('WALLET LIST');

      const results = manager.search('wallet');
      expect(results.matches).toHaveLength(2);
    });
  });

  describe('getByPrefix', () => {
    it('finds commands starting with prefix', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('wallet create');
      await manager.add('wallet list');
      await manager.add('oracle price');
      await manager.add('wallet backup');

      const results = manager.getByPrefix('wallet');
      expect(results).toHaveLength(3);
      // Newest first
      expect(results[0]).toBe('wallet backup');
    });

    it('returns unique commands only', async () => {
      const manager = new HistoryManager({
        historyPath,
        persist: false,
        deduplicate: false,
      });
      await manager.initialize();

      await manager.add('wallet list');
      await manager.add('wallet create');
      await manager.add('wallet list');

      const results = manager.getByPrefix('wallet');
      expect(results).toHaveLength(2);
      // Newest occurrence first
      expect(results[0]).toBe('wallet list');
      expect(results[1]).toBe('wallet create');
    });
  });

  describe('persistence', () => {
    it('saves and loads history from disk', async () => {
      const manager1 = new HistoryManager({ historyPath, persist: true });
      await manager1.initialize();

      await manager1.add('cmd1');
      await manager1.add('cmd2', false);
      await manager1.add('cmd3', true, 100);

      // Create new instance to load from disk
      const manager2 = new HistoryManager({ historyPath, persist: true });
      await manager2.initialize();

      expect(manager2.length).toBe(3);
      expect(manager2.getAll()[0].command).toBe('cmd1');
      expect(manager2.getAll()[1].success).toBe(false);
      expect(manager2.getAll()[2].duration).toBe(100);
    });

    it('clears history and removes file', async () => {
      const manager = new HistoryManager({ historyPath, persist: true });
      await manager.initialize();

      await manager.add('cmd1');
      await manager.add('cmd2');

      await manager.clear();

      expect(manager.length).toBe(0);
      expect(await fs.pathExists(historyPath)).toBe(false);
    });
  });

  describe('formatting', () => {
    it('formats history for display', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('cmd1', true);
      await manager.add('cmd2', false);

      const formatted = manager.format();
      expect(formatted).toContain('cmd1');
      expect(formatted).toContain('cmd2');
      expect(formatted).toContain('!'); // Failed indicator
    });

    it('limits output count', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('cmd1');
      await manager.add('cmd2');
      await manager.add('cmd3');

      const formatted = manager.format(2);
      expect(formatted).not.toContain('cmd1');
      expect(formatted).toContain('cmd2');
      expect(formatted).toContain('cmd3');
    });
  });

  describe('getRecent', () => {
    it('returns most recent entries', async () => {
      const manager = new HistoryManager({ historyPath, persist: false });
      await manager.initialize();

      await manager.add('cmd1');
      await manager.add('cmd2');
      await manager.add('cmd3');
      await manager.add('cmd4');

      const recent = manager.getRecent(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].command).toBe('cmd3');
      expect(recent[1].command).toBe('cmd4');
    });
  });

  describe('singleton', () => {
    it('returns same instance', () => {
      resetHistoryManager();
      const instance1 = getHistoryManager();
      const instance2 = getHistoryManager();
      expect(instance1).toBe(instance2);
    });

    it('resets singleton', () => {
      const instance1 = getHistoryManager();
      resetHistoryManager();
      const instance2 = getHistoryManager();
      expect(instance1).not.toBe(instance2);
    });
  });
});
