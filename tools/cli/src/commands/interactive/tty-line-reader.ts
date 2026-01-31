/**
 * @fileoverview TTY line reader with history (Up/Down) and reverse-i-search (Ctrl+R)
 * @description Used when stdin.isTTY for full key handling; falls back to readline otherwise
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-30
 */

import type { HistoryManager } from './history.js';
import type { HistorySearchResult } from '../../types/interactive-types.js';

const CTRL_R = '\u0012';
const CTRL_C = '\u0003';
const CTRL_D = '\u0004';
const ENTER = '\r';
const BACKSPACE = '\u007f';
const ESC = '\u001b';

/**
 * Read a single line with history (Up/Down), reverse-i-search (Ctrl+R), and Tab completion.
 * Requires process.stdin.isTTY. Caller should use readline.question when !isTTY.
 */
export function readLineWithHistory(options: {
  prompt: string;
  historyManager: HistoryManager;
  onSigint?: () => void;
  completer?: (line: string) => [string[], string];
}): Promise<string | null> {
  const { prompt, historyManager, onSigint, completer } = options;
  const stdin = process.stdin;
  const stdout = process.stdout;

  return new Promise((resolve) => {
    let line = '';
    let inSearchMode = false;
    let searchQuery = '';
    let searchResult: HistorySearchResult = { matches: [], query: '', selectedIndex: 0 };
    let savedLineBeforeSearch = '';
    let escapeBuffer = '';

    function redraw(): void {
      const display = inSearchMode
        ? `(reverse-i-search)'${searchQuery}': ${searchResult.matches[searchResult.selectedIndex] ?? ''}`
        : line;
      stdout.write('\r\x1b[K' + prompt + display);
    }

    function redrawSearch(): void {
      searchResult = historyManager.search(searchQuery);
      if (searchResult.selectedIndex >= searchResult.matches.length && searchResult.matches.length > 0) {
        searchResult.selectedIndex = Math.max(0, searchResult.matches.length - 1);
      }
      redraw();
    }

    function exitSearchMode(acceptMatch: boolean): void {
      if (acceptMatch && searchResult.matches[searchResult.selectedIndex]) {
        line = searchResult.matches[searchResult.selectedIndex].command;
      } else if (!acceptMatch) {
        line = savedLineBeforeSearch;
      }
      inSearchMode = false;
      searchQuery = '';
      searchResult = { matches: [], query: '', selectedIndex: 0 };
      savedLineBeforeSearch = '';
      stdout.write('\r\x1b[K' + prompt + line);
    }

    function handleData(data: Buffer): void {
      const str = data.toString('utf8');

      for (let i = 0; i < str.length; i++) {
        const c = str[i];

        if (escapeBuffer.length > 0) {
          escapeBuffer += c;
          if (escapeBuffer.length >= 3 && escapeBuffer[1] === '[') {
            const key = escapeBuffer[2];
            if (key === 'A') {
              if (inSearchMode) {
                if (searchResult.matches.length > 0) {
                  searchResult.selectedIndex =
                    (searchResult.selectedIndex + 1) % searchResult.matches.length;
                  redraw();
                }
              } else {
                line = historyManager.previous(line);
                redraw();
              }
            } else if (key === 'B') {
              if (inSearchMode) {
                if (searchResult.matches.length > 0) {
                  searchResult.selectedIndex =
                    searchResult.selectedIndex <= 0
                      ? searchResult.matches.length - 1
                      : searchResult.selectedIndex - 1;
                  redraw();
                }
              } else {
                line = historyManager.next();
                redraw();
              }
            } else {
              redraw();
            }
            escapeBuffer = '';
          } else if (escapeBuffer.length >= 2 && escapeBuffer[1] !== '[') {
            if (inSearchMode) {
              exitSearchMode(false);
            }
            escapeBuffer = '';
          }
          continue;
        }

        if (c === ESC) {
          escapeBuffer = ESC;
          continue;
        }

        if (c === CTRL_R) {
          if (!inSearchMode) {
            inSearchMode = true;
            savedLineBeforeSearch = line;
            searchQuery = '';
            redrawSearch();
          } else {
            if (searchResult.matches.length > 0) {
              searchResult.selectedIndex =
                (searchResult.selectedIndex + 1) % searchResult.matches.length;
              redraw();
            }
          }
          continue;
        }

        if (c === ENTER || c === '\n') {
          if (inSearchMode) {
            exitSearchMode(true);
          }
          historyManager.resetNavigation();
          cleanup();
          resolve(line || null);
          return;
        }

        if (c === CTRL_C) {
          if (inSearchMode) {
            exitSearchMode(false);
          } else {
            line = '';
            redraw();
          }
          onSigint?.();
          continue;
        }

        if (c === CTRL_D) {
          if (line.length === 0) {
            cleanup();
            resolve(null);
            return;
          }
          continue;
        }

        if (c === BACKSPACE) {
          if (inSearchMode) {
            searchQuery = searchQuery.slice(0, -1);
            redrawSearch();
          } else {
            line = line.slice(0, -1);
            redraw();
          }
          continue;
        }

        if (c === '\t' && !inSearchMode && completer) {
          const [completions] = completer(line);
          const parts = line.split(/\s+/);
          if (completions.length === 1) {
            const lastIdx = parts.length - 1;
            parts[lastIdx] = completions[0];
            line = parts.join(' ');
            redraw();
          } else if (completions.length > 1) {
            const commonPrefix = completions.reduce((a, b) => {
              let i = 0;
              while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
              return a.slice(0, i);
            });
            const lastPart = parts[parts.length - 1] ?? '';
            if (commonPrefix.length > lastPart.length) {
              parts[parts.length - 1] = commonPrefix;
              line = parts.join(' ');
              redraw();
            }
          }
          continue;
        }

        if ((c >= ' ' && c <= '~') || (c.length === 1 && c !== '\t' && c !== '\n')) {
          if (inSearchMode) {
            searchQuery += c;
            redrawSearch();
          } else {
            line += c;
            redraw();
          }
        }
      }
    }

    function cleanup(): void {
      stdin.removeListener('data', handleData);
      stdin.setRawMode?.(false);
      stdin.pause();
      stdout.write('\n');
    }

    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', handleData);
    stdout.write(prompt);
  });
}
