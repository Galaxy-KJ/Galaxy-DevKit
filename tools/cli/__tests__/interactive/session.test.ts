/**
 * @fileoverview Tests for session state management
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  SessionManager,
  getSessionManager,
  resetSessionManager,
} from '../../src/commands/interactive/session';

describe('SessionManager', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(() => {
    resetSessionManager();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'galaxy-session-'));
    statePath = path.join(tmpDir, 'session.json');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  describe('initialization', () => {
    it('starts with default state', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      const state = manager.getState();
      expect(state.network).toBe('testnet');
      expect(state.activeWallet).toBeNull();
      expect(state.activeWalletName).toBeNull();
      expect(state.commandCount).toBe(0);
      expect(state.variables).toEqual({});
    });

    it('sets working directory', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      expect(manager.getState().workingDirectory).toBe(process.cwd());
    });

    it('sets start timestamp', async () => {
      const before = new Date();
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();
      const after = new Date();

      const startedAt = manager.getState().startedAt;
      expect(startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('network management', () => {
    it('gets current network', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      expect(manager.getNetwork()).toBe('testnet');
    });

    it('sets network', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setNetwork('mainnet');
      expect(manager.getNetwork()).toBe('mainnet');
    });

    it('accepts all valid networks', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setNetwork('testnet');
      expect(manager.getNetwork()).toBe('testnet');

      await manager.setNetwork('mainnet');
      expect(manager.getNetwork()).toBe('mainnet');

      await manager.setNetwork('futurenet');
      expect(manager.getNetwork()).toBe('futurenet');

      await manager.setNetwork('standalone');
      expect(manager.getNetwork()).toBe('standalone');
    });

    it('emits network-change event', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      const events: any[] = [];
      manager.on('network-change', (data) => events.push(data));

      await manager.setNetwork('mainnet');

      expect(events).toHaveLength(1);
      expect(events[0].oldNetwork).toBe('testnet');
      expect(events[0].newNetwork).toBe('mainnet');
    });
  });

  describe('wallet management', () => {
    it('starts with no active wallet', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      expect(manager.getActiveWallet()).toBeNull();
      expect(manager.getActiveWalletName()).toBeNull();
    });

    it('sets active wallet', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      const publicKey = 'GABCDEF1234567890';
      await manager.setActiveWallet(publicKey, 'my-wallet');

      expect(manager.getActiveWallet()).toBe(publicKey);
      expect(manager.getActiveWalletName()).toBe('my-wallet');
    });

    it('clears active wallet', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setActiveWallet('GABCDEF', 'wallet');
      await manager.setActiveWallet(null, null);

      expect(manager.getActiveWallet()).toBeNull();
      expect(manager.getActiveWalletName()).toBeNull();
    });

    it('emits wallet-change event', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      const events: any[] = [];
      manager.on('wallet-change', (data) => events.push(data));

      await manager.setActiveWallet('GABCDEF', 'wallet');

      expect(events).toHaveLength(1);
      expect(events[0].oldWallet).toBeNull();
      expect(events[0].newWallet).toBe('GABCDEF');
      expect(events[0].name).toBe('wallet');
    });
  });

  describe('variables', () => {
    it('sets and gets variables', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setVariable('MY_VAR', 'my_value');
      expect(manager.getVariable('MY_VAR')).toBe('my_value');
    });

    it('returns undefined for non-existent variable', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      expect(manager.getVariable('NONEXISTENT')).toBeUndefined();
    });

    it('unsets variable', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setVariable('MY_VAR', 'value');
      const result = await manager.unsetVariable('MY_VAR');

      expect(result).toBe(true);
      expect(manager.getVariable('MY_VAR')).toBeUndefined();
    });

    it('returns false when unsetting non-existent variable', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      const result = await manager.unsetVariable('NONEXISTENT');
      expect(result).toBe(false);
    });

    it('gets all variables', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setVariable('VAR1', 'value1');
      await manager.setVariable('VAR2', 'value2');

      const variables = manager.getVariables();
      expect(variables).toEqual({ VAR1: 'value1', VAR2: 'value2' });
    });

    it('emits session-change event on variable change', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      const events: any[] = [];
      manager.on('session-change', (data) => events.push(data));

      await manager.setVariable('VAR', 'value');
      await manager.unsetVariable('VAR');

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('variable-set');
      expect(events[1].type).toBe('variable-unset');
    });
  });

  describe('command tracking', () => {
    it('records command execution', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      manager.recordCommand();
      manager.recordCommand();
      manager.recordCommand();

      const stats = manager.getStats();
      expect(stats.commandCount).toBe(3);
    });

    it('updates lastCommandAt timestamp', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      expect(manager.getStats().lastCommandAt).toBeNull();

      manager.recordCommand();

      expect(manager.getStats().lastCommandAt).not.toBeNull();
    });

    it('calculates session duration', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = manager.getStats();
      expect(stats.duration).toBeGreaterThanOrEqual(50);
    });
  });

  describe('caching', () => {
    it('sets and gets cache values', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      manager.setCache('key', { data: 'value' });
      const cached = manager.getCache<{ data: string }>('key');

      expect(cached).toEqual({ data: 'value' });
    });

    it('returns undefined for missing cache keys', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      expect(manager.getCache('missing')).toBeUndefined();
    });

    it('clears cache', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      manager.setCache('key1', 'value1');
      manager.setCache('key2', 'value2');
      manager.clearCache();

      expect(manager.getCache('key1')).toBeUndefined();
      expect(manager.getCache('key2')).toBeUndefined();
    });
  });

  describe('persistence', () => {
    it('saves and loads state', async () => {
      const manager1 = new SessionManager({ statePath, autoSave: true });
      await manager1.initialize();

      await manager1.setNetwork('mainnet');
      await manager1.setActiveWallet('GABCDEF', 'wallet');
      await manager1.setVariable('VAR', 'value');

      // Create new manager to load from disk
      const manager2 = new SessionManager({ statePath, autoSave: true });
      await manager2.initialize();

      expect(manager2.getNetwork()).toBe('mainnet');
      expect(manager2.getActiveWallet()).toBe('GABCDEF');
      expect(manager2.getActiveWalletName()).toBe('wallet');
      expect(manager2.getVariable('VAR')).toBe('value');
    });

    it('does not persist session-only state', async () => {
      const manager1 = new SessionManager({ statePath, autoSave: true });
      await manager1.initialize();

      manager1.recordCommand();
      manager1.recordCommand();

      // Create new manager
      const manager2 = new SessionManager({ statePath, autoSave: true });
      await manager2.initialize();

      // Command count should reset
      expect(manager2.getStats().commandCount).toBe(0);
    });
  });

  describe('reset', () => {
    it('resets state to defaults', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setNetwork('mainnet');
      await manager.setActiveWallet('GABCDEF', 'wallet');
      await manager.setVariable('VAR', 'value');
      manager.recordCommand();

      await manager.reset();

      expect(manager.getNetwork()).toBe('testnet');
      expect(manager.getActiveWallet()).toBeNull();
      expect(manager.getVariable('VAR')).toBeUndefined();
      expect(manager.getStats().commandCount).toBe(0);
    });

    it('emits session-change event', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      const events: any[] = [];
      manager.on('session-change', (data) => events.push(data));

      await manager.reset();

      expect(events.some((e) => e.type === 'reset')).toBe(true);
    });
  });

  describe('prompt prefix', () => {
    it('returns empty for default state', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      expect(manager.getPromptPrefix()).toBe('');
    });

    it('includes network when not testnet', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setNetwork('mainnet');
      expect(manager.getPromptPrefix()).toContain('[mainnet]');
    });

    it('includes wallet name when set', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setActiveWallet('GABCDEF', 'my-wallet');
      expect(manager.getPromptPrefix()).toContain('(my-wallet)');
    });

    it('truncates public key when no name', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setActiveWallet('GABCDEFGHIJKLMNOP', null);
      const prefix = manager.getPromptPrefix();
      expect(prefix).toContain('(GABC...MNOP)');
    });
  });

  describe('formatInfo', () => {
    it('formats session info for display', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      await manager.setNetwork('mainnet');
      await manager.setActiveWallet('GABCDEF', 'wallet');
      await manager.setVariable('VAR', 'value');

      const info = manager.formatInfo();

      expect(info).toContain('Network: mainnet');
      expect(info).toContain('Wallet: wallet');
      expect(info).toContain('Variables:');
      expect(info).toContain('VAR=value');
    });
  });

  describe('singleton', () => {
    it('returns same instance', () => {
      const instance1 = getSessionManager();
      const instance2 = getSessionManager();
      expect(instance1).toBe(instance2);
    });

    it('resets singleton', () => {
      const instance1 = getSessionManager();
      resetSessionManager();
      const instance2 = getSessionManager();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('event handling', () => {
    it('subscribes and unsubscribes from events', async () => {
      const manager = new SessionManager({ statePath, autoSave: false });
      await manager.initialize();

      const events: any[] = [];
      const handler = (data: any) => events.push(data);

      manager.on('network-change', handler);
      await manager.setNetwork('mainnet');

      manager.off('network-change', handler);
      await manager.setNetwork('testnet');

      expect(events).toHaveLength(1);
    });
  });
});
