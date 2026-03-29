/**
 * @fileoverview Tests for autocomplete functionality
 */

import {
  AutocompleteManager,
  getAutocompleteManager,
  resetAutocompleteManager,
  COMMAND_REGISTRY,
} from '../../src/commands/interactive/autocomplete';
import { resetHistoryManager } from '../../src/commands/interactive/history';
import type { CommandDefinition } from '../../src/types/interactive-types';

describe('AutocompleteManager', () => {
  beforeEach(() => {
    resetAutocompleteManager();
    resetHistoryManager();
  });

  describe('command suggestions', () => {
    it('suggests all commands for empty input', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.value === 'help')).toBe(true);
      expect(suggestions.some((s) => s.value === 'wallet')).toBe(true);
      expect(suggestions.some((s) => s.value === 'oracle')).toBe(true);
    });

    it('filters commands by prefix', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('wa');

      expect(suggestions.some((s) => s.value === 'wallet')).toBe(true);
      expect(suggestions.every((s) => !s.value.startsWith('ora'))).toBe(true);
    });

    it('is case-insensitive', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const lowerSuggestions = manager.getSuggestions('help');
      const upperSuggestions = manager.getSuggestions('HELP');
      const mixedSuggestions = manager.getSuggestions('HeLp');

      expect(lowerSuggestions.length).toBe(upperSuggestions.length);
      expect(lowerSuggestions.length).toBe(mixedSuggestions.length);
    });
  });

  describe('subcommand suggestions', () => {
    it('suggests subcommands after parent command', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('wallet ');

      expect(suggestions.some((s) => s.value === 'create')).toBe(true);
      expect(suggestions.some((s) => s.value === 'list')).toBe(true);
      expect(suggestions.some((s) => s.value === 'import')).toBe(true);
    });

    it('filters subcommands by prefix', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('wallet cr');

      expect(suggestions.some((s) => s.value === 'create')).toBe(true);
      expect(suggestions.every((s) => s.value !== 'list')).toBe(true);
    });

    it('handles nested subcommands', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('wallet multisig ');

      expect(suggestions.some((s) => s.value === 'create')).toBe(true);
      expect(suggestions.some((s) => s.value === 'propose')).toBe(true);
      expect(suggestions.some((s) => s.value === 'sign')).toBe(true);
    });
  });

  describe('option suggestions', () => {
    it('suggests options after command', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('create myproject ');

      expect(suggestions.some((s) => s.value === '--template')).toBe(true);
      expect(suggestions.some((s) => s.value === '--directory')).toBe(true);
    });

    it('suggests options when starting with dash', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('create myproject --');

      expect(suggestions.every((s) => s.value.startsWith('--'))).toBe(true);
    });

    it('filters options by prefix', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('create myproject --tem');

      expect(suggestions.some((s) => s.value === '--template')).toBe(true);
      expect(suggestions.every((s) => s.value !== '--directory')).toBe(true);
    });
  });

  describe('option value suggestions', () => {
    it('suggests values for options with predefined values', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('create myproject --template ');

      expect(suggestions.some((s) => s.value === 'basic')).toBe(true);
      expect(suggestions.some((s) => s.value === 'defi')).toBe(true);
      expect(suggestions.some((s) => s.value === 'nft')).toBe(true);
    });

    it('filters option values by prefix', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('create myproject --template de');

      expect(suggestions.some((s) => s.value === 'defi')).toBe(true);
      expect(suggestions.every((s) => s.value !== 'basic')).toBe(true);
    });

    it('suggests network values for network command', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('network ');

      expect(suggestions.some((s) => s.value === 'testnet')).toBe(true);
      expect(suggestions.some((s) => s.value === 'mainnet')).toBe(true);
    });
  });

  describe('suggestion types', () => {
    it('marks top-level commands correctly', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('hel');

      const helpSuggestion = suggestions.find((s) => s.value === 'help');
      expect(helpSuggestion?.type).toBe('command');
    });

    it('marks subcommands correctly', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('wallet ');

      const createSuggestion = suggestions.find((s) => s.value === 'create');
      expect(createSuggestion?.type).toBe('subcommand');
    });

    it('marks options correctly', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('create myproject --');

      const templateSuggestion = suggestions.find((s) => s.value === '--template');
      expect(templateSuggestion?.type).toBe('option');
    });
  });

  describe('help text', () => {
    it('returns help for existing command', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const help = manager.getHelp('help');

      expect(help).not.toBeNull();
      expect(help).toContain('help');
      expect(help).toContain('Show help information');
    });

    it('returns help for subcommand', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const help = manager.getHelp('wallet create');

      expect(help).not.toBeNull();
      expect(help).toContain('create');
    });

    it('returns null for unknown command', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const help = manager.getHelp('nonexistent');

      expect(help).toBeNull();
    });

    it('includes options in help', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const help = manager.getHelp('create');

      expect(help).toContain('--template');
      expect(help).toContain('--directory');
    });

    it('includes examples in help', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const help = manager.getHelp('help');

      expect(help).toContain('Examples:');
    });
  });

  describe('command registry', () => {
    it('getAllCommandNames returns flat list', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const names = manager.getAllCommandNames();

      expect(names).toContain('help');
      expect(names).toContain('wallet');
      expect(names).toContain('wallet create');
      expect(names).toContain('wallet multisig');
      expect(names).toContain('wallet multisig create');
    });

    it('hasCommand checks existence', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);

      expect(manager.hasCommand('help')).toBe(true);
      expect(manager.hasCommand('wallet')).toBe(true);
      expect(manager.hasCommand('wallet create')).toBe(true);
      expect(manager.hasCommand('nonexistent')).toBe(false);
    });

    it('allows registering custom commands', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);

      const customCommand: CommandDefinition = {
        name: 'custom',
        description: 'Custom test command',
        options: [
          { long: '--verbose', description: 'Verbose output', requiresValue: false },
        ],
      };

      manager.registerCommand(customCommand);

      expect(manager.hasCommand('custom')).toBe(true);
      const suggestions = manager.getSuggestions('cust');
      expect(suggestions.some((s) => s.value === 'custom')).toBe(true);
    });
  });

  describe('complex inputs', () => {
    it('handles multiple options', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      const suggestions = manager.getSuggestions('create myproject --template basic --');

      // Should not suggest --template again
      expect(suggestions.every((s) => s.value !== '--template')).toBe(true);
      expect(suggestions.some((s) => s.value === '--directory')).toBe(true);
    });

    it('handles spaces in arguments', () => {
      const manager = new AutocompleteManager(COMMAND_REGISTRY);
      // After oracle price command
      const suggestions = manager.getSuggestions('oracle price XLM/USD ');

      expect(suggestions.some((s) => s.value === '--json')).toBe(true);
      expect(suggestions.some((s) => s.value === '--strategy')).toBe(true);
    });
  });

  describe('singleton', () => {
    it('returns same instance', () => {
      const instance1 = getAutocompleteManager();
      const instance2 = getAutocompleteManager();
      expect(instance1).toBe(instance2);
    });

    it('resets singleton', () => {
      const instance1 = getAutocompleteManager();
      resetAutocompleteManager();
      const instance2 = getAutocompleteManager();
      expect(instance1).not.toBe(instance2);
    });
  });
});
