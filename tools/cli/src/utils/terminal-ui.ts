/**
 * @fileoverview Terminal UI utility for Galaxy CLI
 * @description Provides layouts and widgets using blessed and blessed-contrib
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';

export class TerminalUI {
  private screen: blessed.Widgets.Screen;
  private grid: contrib.grid;

  constructor(title: string) {
    this.screen = blessed.screen({
      smartCSR: true,
      title: title,
    });

    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    // Exit on Escape, q, or Control-C
    this.screen.key(['escape', 'q', 'C-c'], () => {
      return process.exit(0);
    });
  }

  getScreen() {
    return this.screen;
  }

  getGrid() {
    return this.grid;
  }

  render() {
    this.screen.render();
  }

  /**
   * Create a box for logs or activity
   */
  createLogBox(options: {
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
    label: string;
  }) {
    return this.grid.set(
      options.row,
      options.col,
      options.rowSpan,
      options.colSpan,
      blessed.log,
      {
        fg: 'green',
        selectedFg: 'green',
        label: options.label,
        border: { type: 'line', fg: 'cyan' },
        scrollable: true,
        alwaysScroll: true,
        scrollbar: { ch: ' ', inverse: true },
      }
    );
  }

  /**
   * Create a line chart
   */
  createLineChart(options: {
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
    label: string;
  }) {
    return this.grid.set(
      options.row,
      options.col,
      options.rowSpan,
      options.colSpan,
      contrib.line,
      {
        style: {
          line: 'yellow',
          text: 'green',
          baseline: 'black',
        },
        xLabelPadding: 3,
        xPadding: 5,
        label: options.label,
        showLegend: true,
      }
    );
  }

  /**
   * Create a simple data display table
   */
  createTable(options: {
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
    label: string;
    headers: string[];
  }) {
    return this.grid.set(
      options.row,
      options.col,
      options.rowSpan,
      options.colSpan,
      contrib.table,
      {
        keys: true,
        fg: 'white',
        selectedFg: 'white',
        selectedBg: 'blue',
        interactive: false,
        label: options.label,
        width: '30%',
        height: '30%',
        border: { type: 'line', fg: 'cyan' },
        columnSpacing: 10,
        columnWidth: [15, 15, 15],
      }
    );
  }

  /**
   * Create a simple box for text display
   */
  createBox(options: {
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
    label: string;
    content?: string;
  }) {
    return this.grid.set(
      options.row,
      options.col,
      options.rowSpan,
      options.colSpan,
      (blessed as any).box,
      {
        label: options.label,
        content: options.content || '',
        border: { type: 'line', fg: 'cyan' },
        style: { fg: 'white' },
      }
    );
  }
}
