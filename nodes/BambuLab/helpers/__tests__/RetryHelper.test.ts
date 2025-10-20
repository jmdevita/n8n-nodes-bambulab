import { RetryHelper } from '../RetryHelper';

describe('RetryHelper', () => {
	describe('withRetry', () => {
		it('should succeed on first attempt', async () => {
			const mockFn = jest.fn().mockResolvedValue('success');

			const result = await RetryHelper.withRetry(mockFn);

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(1);
		});

		it('should retry on failure and eventually succeed', async () => {
			const mockFn = jest
				.fn()
				.mockRejectedValueOnce(new Error('Fail 1'))
				.mockRejectedValueOnce(new Error('Fail 2'))
				.mockResolvedValue('success');

			const result = await RetryHelper.withRetry(mockFn, { maxRetries: 3 });

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(3);
		});

		it('should throw error after max retries', async () => {
			const mockFn = jest.fn().mockRejectedValue(new Error('Always fails'));

			await expect(RetryHelper.withRetry(mockFn, { maxRetries: 2 })).rejects.toThrow('Always fails');

			expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
		});

		it('should call onRetry callback', async () => {
			const mockFn = jest
				.fn()
				.mockRejectedValueOnce(new Error('Fail 1'))
				.mockResolvedValue('success');

			const onRetrySpy = jest.fn();

			await RetryHelper.withRetry(mockFn, {
				maxRetries: 2,
				onRetry: onRetrySpy,
			});

			expect(onRetrySpy).toHaveBeenCalledTimes(1);
			expect(onRetrySpy).toHaveBeenCalledWith(
				1,
				expect.any(Error),
				expect.any(Number)
			);
		});

		it('should use exponential backoff', async () => {
			const mockFn = jest
				.fn()
				.mockRejectedValueOnce(new Error('Fail 1'))
				.mockRejectedValueOnce(new Error('Fail 2'))
				.mockResolvedValue('success');

			const delays: number[] = [];
			const onRetrySpy = jest.fn((_attempt, _error, delay) => {
				delays.push(delay);
			});

			await RetryHelper.withRetry(mockFn, {
				maxRetries: 3,
				initialDelay: 100,
				backoffMultiplier: 2,
				onRetry: onRetrySpy,
			});

			// Delays should be: 100, 200
			expect(delays[0]).toBe(100);
			expect(delays[1]).toBe(200);
		});
	});

	describe('isRetryableError', () => {
		it('should identify connection errors as retryable', () => {
			expect(RetryHelper.isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
			expect(RetryHelper.isRetryableError(new Error('ECONNRESET'))).toBe(true);
			expect(RetryHelper.isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
			expect(RetryHelper.isRetryableError(new Error('Connection timeout'))).toBe(true);
		});

		it('should identify non-retryable errors', () => {
			expect(RetryHelper.isRetryableError(new Error('Authentication failed'))).toBe(false);
			expect(RetryHelper.isRetryableError(new Error('Invalid request'))).toBe(false);
		});
	});

	describe('withConditionalRetry', () => {
		it('should retry on retryable errors', async () => {
			const mockFn = jest
				.fn()
				.mockRejectedValueOnce(new Error('ECONNREFUSED'))
				.mockResolvedValue('success');

			const result = await RetryHelper.withConditionalRetry(mockFn);

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(2);
		});

		it('should not retry on non-retryable errors', async () => {
			const mockFn = jest.fn().mockRejectedValue(new Error('Authentication failed'));

			await expect(RetryHelper.withConditionalRetry(mockFn)).rejects.toThrow(
				'Authentication failed'
			);

			expect(mockFn).toHaveBeenCalledTimes(1);
		});
	});
});
