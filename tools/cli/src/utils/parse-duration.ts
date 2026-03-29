/**
 * @fileoverview Duration parsing utility for CLI
 * @description Parses duration strings like 30s, 5m, 1h into milliseconds
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-26
 */

const DURATION_REGEX = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i;

const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parse a duration string into milliseconds.
 * Examples: 500ms, 30s, 5m, 1h, 2d
 * If no unit is provided, the value is treated as milliseconds.
 */
export function parseDuration(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Duration value is required');
  }

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return numeric;
  }

  const match = trimmed.match(DURATION_REGEX);
  if (!match) {
    throw new Error(`Invalid duration format: ${input}`);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = UNIT_TO_MS[unit];

  if (!Number.isFinite(value) || value < 0 || !multiplier) {
    throw new Error(`Invalid duration value: ${input}`);
  }

  return value * multiplier;
}
