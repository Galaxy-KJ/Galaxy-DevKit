/**
 * @fileoverview Retry utilities with exponential backoff
 * @description Retry logic for external API calls with exponential backoff
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

/**
 * Retry configuration
 * @interface RetryConfig
 * @property {number} maxAttempts - Maximum number of retry attempts (default: 3)
 * @property {number} initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @property {number} maxDelayMs - Maximum delay in milliseconds (default: 10000)
 * @property {number} backoffMultiplier - Backoff multiplier (default: 2)
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Check if an error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  if (!error) return false;

  const message = error.message || '';
  const name = error.name || '';

  // Network errors
  if (
    message.includes('timeout') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ENOTFOUND') ||
    message.includes('ECONNREFUSED')
  ) {
    return true;
  }

  // HTTP 5xx errors (if error has status property)
  const status = (error as any).status || (error as any).statusCode;
  if (status && status >= 500 && status < 600) {
    return true;
  }

  // Rate limiting (429)
  if (status === 429) {
    return true;
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @template T
 * @param {() => Promise<T>} fn - Function to retry
 * @param {Partial<RetryConfig>} config - Retry configuration
 * @returns {Promise<T>} Result of the function
 * @throws {Error} Last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry if error is not retryable
      if (!isRetryableError(lastError)) {
        throw lastError;
      }

      // Don't wait after the last attempt
      if (attempt < retryConfig.maxAttempts - 1) {
        const delay = Math.min(
          retryConfig.initialDelayMs *
            Math.pow(retryConfig.backoffMultiplier, attempt),
          retryConfig.maxDelayMs
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Retry failed: unknown error');
}
