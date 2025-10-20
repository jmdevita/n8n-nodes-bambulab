import { RETRY_CONFIG } from './constants';

/**
 * Retry configuration options
 */
export interface RetryOptions {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Initial delay before first retry in milliseconds (default: 1000) */
	initialDelay?: number;
	/** Maximum delay between retries in milliseconds (default: 10000) */
	maxDelay?: number;
	/** Backoff multiplier for exponential backoff (default: 2) */
	backoffMultiplier?: number;
	/** Optional callback for logging retry attempts */
	onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
}

/**
 * Helper class for implementing retry logic with exponential backoff
 *
 * @example
 * const result = await RetryHelper.withRetry(
 *   async () => await someOperation(),
 *   { maxRetries: 3, onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error}`) }
 * );
 */
export class RetryHelper {
	/**
	 * Execute an async function with retry logic and exponential backoff
	 *
	 * @param fn The async function to execute
	 * @param options Retry configuration options
	 * @returns Promise resolving to the function's result
	 * @throws The last error if all retries fail
	 */
	static async withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
		const {
			maxRetries = RETRY_CONFIG.MAX_RETRIES,
			initialDelay = RETRY_CONFIG.INITIAL_DELAY,
			maxDelay = RETRY_CONFIG.MAX_DELAY,
			backoffMultiplier = RETRY_CONFIG.BACKOFF_MULTIPLIER,
			onRetry,
		} = options;

		let lastError: Error | undefined;
		let attempt = 0;

		while (attempt <= maxRetries) {
			try {
				return await fn();
			} catch (error) {
				lastError = error as Error;
				attempt++;

				// If we've exhausted all retries, throw the error
				if (attempt > maxRetries) {
					throw lastError;
				}

				// Calculate delay with exponential backoff
				const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt - 1), maxDelay);

				// Call onRetry callback if provided
				if (onRetry) {
					onRetry(attempt, lastError, delay);
				}

				// Wait before retrying
				await this.sleep(delay);
			}
		}

		// This should never be reached, but TypeScript needs it
		throw lastError || new Error('Retry failed with unknown error');
	}

	/**
	 * Sleep for a specified duration
	 *
	 * @param ms Duration in milliseconds
	 * @returns Promise that resolves after the delay
	 */
	private static sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Check if an error is retryable
	 * Common transient errors that should be retried
	 *
	 * @param error The error to check
	 * @returns true if the error should be retried
	 */
	static isRetryableError(error: Error): boolean {
		const retryablePatterns = [
			/ECONNREFUSED/i,
			/ECONNRESET/i,
			/ETIMEDOUT/i,
			/ENOTFOUND/i,
			/timeout/i,
			/network/i,
			/connection/i,
		];

		return retryablePatterns.some((pattern) => pattern.test(error.message));
	}

	/**
	 * Execute with retry only for retryable errors
	 *
	 * @param fn The async function to execute
	 * @param options Retry configuration options
	 * @returns Promise resolving to the function's result
	 * @throws Immediately if error is not retryable, or after retries if retryable
	 */
	static async withConditionalRetry<T>(
		fn: () => Promise<T>,
		options: RetryOptions = {},
	): Promise<T> {
		let attempt = 0;
		const maxRetries = options.maxRetries ?? RETRY_CONFIG.MAX_RETRIES;

		while (attempt <= maxRetries) {
			try {
				return await fn();
			} catch (error) {
				const err = error as Error;

				// Check if error is retryable
				if (!this.isRetryableError(err)) {
					// Non-retryable error - throw immediately without retry
					throw err;
				}

				// Retryable error - apply retry logic
				attempt++;

				if (attempt > maxRetries) {
					// Exhausted retries
					throw err;
				}

				// Calculate delay and wait
				const initialDelay = options.initialDelay ?? RETRY_CONFIG.INITIAL_DELAY;
				const maxDelay = options.maxDelay ?? RETRY_CONFIG.MAX_DELAY;
				const backoffMultiplier = options.backoffMultiplier ?? RETRY_CONFIG.BACKOFF_MULTIPLIER;

				const delay = Math.min(
					initialDelay * Math.pow(backoffMultiplier, attempt - 1),
					maxDelay
				);

				if (options.onRetry) {
					options.onRetry(attempt, err, delay);
				}

				await this.sleep(delay);
			}
		}

		// Should never reach here
		throw new Error('Retry failed with unknown error');
	}
}
