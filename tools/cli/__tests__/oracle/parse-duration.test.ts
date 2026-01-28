/**
 * @fileoverview Tests for parseDuration
 */

import { parseDuration } from '../../src/utils/parse-duration';

describe('parseDuration', () => {
  it('parses seconds', () => {
    expect(parseDuration('5s')).toBe(5000);
  });

  it('parses minutes', () => {
    expect(parseDuration('2m')).toBe(120000);
  });

  it('parses milliseconds by default', () => {
    expect(parseDuration('250')).toBe(250);
  });

  it('throws on invalid input', () => {
    expect(() => parseDuration('oops')).toThrow('Invalid duration format');
  });
});
