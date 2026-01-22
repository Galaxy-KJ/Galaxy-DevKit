/**
 * @fileoverview Tests for retry utilities
 * @description Unit tests for retry with exponential backoff
 */

import {
  retryWithBackoff,
  isRetryableError,
} from '../../src/utils/retry-utils';

describe('retry-utils', () => {
  describe('isRetryableError', () => {
    it('should identify network timeout errors as retryable', () => {
      const error = new Error('timeout');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify connection reset errors as retryable', () => {
      const error = new Error('ECONNRESET');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify 5xx errors as retryable', () => {
      const error = new Error('Server error');
      (error as any).status = 500;
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify 429 errors as retryable', () => {
      const error = new Error('Rate limit');
      (error as any).status = 429;
      expect(isRetryableError(error)).toBe(true);
    });

    it('should not identify 4xx errors (except 429) as retryable', () => {
      const error = new Error('Bad request');
      (error as any).status = 400;
      expect(isRetryableError(error)).toBe(false);
    });

    it('should not identify non-retryable errors', () => {
      const error = new Error('Invalid input');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const error = new Error('timeout');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const result = await retryWithBackoff(fn, { maxAttempts: 3 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const error = new Error('timeout');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        retryWithBackoff(fn, { maxAttempts: 2 })
      ).rejects.toThrow('timeout');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Invalid input');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(retryWithBackoff(fn)).rejects.toThrow('Invalid input');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const error = new Error('timeout');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const start = Date.now();
      await retryWithBackoff(fn, {
        maxAttempts: 3,
        initialDelayMs: 100,
      });
      const duration = Date.now() - start;

      // Should have waited at least 100ms (first retry) + 200ms (second retry)
      expect(duration).toBeGreaterThanOrEqual(250);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
