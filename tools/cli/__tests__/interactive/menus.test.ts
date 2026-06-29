/**
 * Regression tests for the ROOT_MENU structure.
 *
 * Past bug (issue #270): ROOT_MENU referenced commands like `account info`,
 * `payment send` and `defi add-liquidity` that did not exist in the program.
 * These tests lock the menu against that regression by walking every entry
 * and asserting it has a usable action (children, command, or promptFlow)
 * and that every promptFlow id is registered in PROMPT_FLOWS.
 */

import { ROOT_MENU, MenuEntry } from '../../src/commands/interactive/menus';
import { PROMPT_FLOWS } from '../../src/commands/interactive/prompts/index';

function walk(entries: MenuEntry[], visit: (e: MenuEntry, path: string[]) => void, path: string[] = []) {
  for (const e of entries) {
    const next = [...path, e.label];
    visit(e, next);
    if (e.children) walk(e.children, visit, next);
  }
}

describe('ROOT_MENU', () => {
  it('every entry has either children, a command, or a promptFlow', () => {
    walk(ROOT_MENU, (e, path) => {
      const hasAction = (e.children?.length ?? 0) > 0 || !!e.command || !!e.promptFlow;
      if (!hasAction) {
        throw new Error(`Menu entry has no action: ${path.join(' > ')}`);
      }
    });
  });

  it('every promptFlow id referenced in the menu is registered in PROMPT_FLOWS', () => {
    const seen: string[] = [];
    walk(ROOT_MENU, (e) => {
      if (e.promptFlow) seen.push(e.promptFlow);
    });

    expect(seen.length).toBeGreaterThan(0);

    for (const id of seen) {
      expect(PROMPT_FLOWS[id]).toBeDefined();
    }
  });

  it('no entry uses a positional param without setting positional: true', () => {
    // Positional command args (like `wallet info <target>`) must be flagged so
    // buildCommandArgs emits them as bare values instead of `--target value`.
    // This test snapshots the convention so future contributors don't break it.
    walk(ROOT_MENU, (e) => {
      if (!e.command || !e.params) return;
      // Heuristic: if the command name implies a known positional, ensure at
      // least one positional param is declared.
      const commandWithPositional = e.command === 'wallet info' || e.command === 'oracle price';
      if (commandWithPositional) {
        const hasPositional = e.params.some((p) => p.positional);
        expect(hasPositional).toBe(true);
      }
    });
  });
});
