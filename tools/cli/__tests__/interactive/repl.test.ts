/**
 * @fileoverview Tests for REPL (GalaxyRepl) executeCommand and behavior
 */

import { GalaxyRepl, createRepl, resetAll } from '../../src/commands/interactive/index';

describe('GalaxyRepl', () => {
  let repl: GalaxyRepl;
  let executedCommands: string[];

  beforeEach(() => {
    resetAll();
    executedCommands = [];
    repl = createRepl({
      history: { maxEntries: 100, persist: false, deduplicate: true },
      session: { autoSave: false, timeout: 0 },
    });
    repl.setCommandExecutor(async (cmd: string) => {
      executedCommands.push(cmd);
    });
  });

  describe('executeCommand - built-in commands', () => {
    it('returns exit: true for "exit"', async () => {
      const result = await repl.executeCommand('exit');
      expect(result).toEqual({ success: true, exit: true });
    });

    it('returns exit: true for "quit"', async () => {
      const result = await repl.executeCommand('quit');
      expect(result).toEqual({ success: true, exit: true });
    });

    it('handles "clear" and returns success', async () => {
      const consoleSpy = jest.spyOn(console, 'clear').mockImplementation();
      const result = await repl.executeCommand('clear');
      expect(result.success).toBe(true);
      expect(result.exit).toBeUndefined();
      consoleSpy.mockRestore();
    });

    it('handles "help" and returns success', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = await repl.executeCommand('help');
      expect(result.success).toBe(true);
      expect(result.exit).toBeUndefined();
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('handles "help wallet" and returns success', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = await repl.executeCommand('help wallet');
      expect(result.success).toBe(true);
      logSpy.mockRestore();
    });

    it('handles "session" and returns success', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = await repl.executeCommand('session');
      expect(result.success).toBe(true);
      logSpy.mockRestore();
    });

    it('handles "history" and returns success', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = await repl.executeCommand('history');
      expect(result.success).toBe(true);
      logSpy.mockRestore();
    });

    it('handles "network" and returns success', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = await repl.executeCommand('network');
      expect(result.success).toBe(true);
      logSpy.mockRestore();
    });
  });

  describe('executeCommand - delegated commands', () => {
    it('calls executor for unknown galaxy command', async () => {
      const result = await repl.executeCommand('create my-app');
      expect(result.success).toBe(true);
      expect(executedCommands).toEqual(['create my-app']);
    });

    it('calls executor for wallet create', async () => {
      const result = await repl.executeCommand('wallet create --name dev');
      expect(result.success).toBe(true);
      expect(executedCommands).toEqual(['wallet create --name dev']);
    });

    it('calls executor for oracle price', async () => {
      const result = await repl.executeCommand('oracle price XLM/USD');
      expect(result.success).toBe(true);
      expect(executedCommands).toContain('oracle price XLM/USD');
    });
  });

  describe('executeCommand - error handling', () => {
    it('returns success: false when executor throws', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation();
      repl.setCommandExecutor(async () => {
        throw new Error('Executor failed');
      });
      const result = await repl.executeCommand('build');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect((result.error as Error).message).toBe('Executor failed');
      errSpy.mockRestore();
    });

    it('does not throw when executor throws', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation();
      repl.setCommandExecutor(async () => {
        throw new Error('Executor failed');
      });
      await expect(repl.executeCommand('build')).resolves.toMatchObject({
        success: false,
        error: expect.any(Error),
      });
      errSpy.mockRestore();
    });
  });

  describe('executeCommand - unknown command', () => {
    it('delegates unknown command to executor (Commander may then report unknown command)', async () => {
      const result = await repl.executeCommand('notabuiltin');
      // Unknown commands are passed to the executor; our mock succeeds
      expect(result.success).toBe(true);
      expect(executedCommands).toContain('notabuiltin');
    });
  });

  describe('completer', () => {
    it('returns suggestions for empty input', () => {
      const autocomplete = repl.getAutocomplete();
      const suggestions = autocomplete.getSuggestions('');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.value === 'help')).toBe(true);
      expect(suggestions.some((s) => s.value === 'wallet')).toBe(true);
    });

    it('returns wallet subcommands for "wallet "', () => {
      const autocomplete = repl.getAutocomplete();
      const suggestions = autocomplete.getSuggestions('wallet ');
      expect(suggestions.some((s) => s.value === 'create')).toBe(true);
      expect(suggestions.some((s) => s.value === 'list')).toBe(true);
    });

    it('returns blend subcommands for "blend "', () => {
      const autocomplete = repl.getAutocomplete();
      const suggestions = autocomplete.getSuggestions('blend ');
      expect(suggestions.some((s) => s.value === 'supply')).toBe(true);
      expect(suggestions.some((s) => s.value === 'borrow')).toBe(true);
    });

    it('returns watch subcommands for "watch "', () => {
      const autocomplete = repl.getAutocomplete();
      const suggestions = autocomplete.getSuggestions('watch ');
      expect(suggestions.some((s) => s.value === 'account')).toBe(true);
      expect(suggestions.some((s) => s.value === 'dashboard')).toBe(true);
    });
  });

  describe('getSession / getHistory / getAutocomplete', () => {
    it('exposes session manager', () => {
      expect(repl.getSession()).toBeDefined();
      expect(repl.getSession().getNetwork()).toBe('testnet');
    });

    it('exposes history manager', () => {
      expect(repl.getHistory()).toBeDefined();
    });

    it('exposes autocomplete manager', () => {
      expect(repl.getAutocomplete()).toBeDefined();
    });
  });
});
