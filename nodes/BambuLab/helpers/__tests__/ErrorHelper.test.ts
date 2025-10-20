import { ErrorHelper } from '../ErrorHelper';

describe('ErrorHelper', () => {
	describe('factory methods', () => {
		it('should create MQTT connection timeout error', () => {
			const error = ErrorHelper.mqttConnectionTimeout(10000);

			expect(error.message).toContain('MQTT connection timeout');
			expect(error.message).toContain('10000ms');
		});

		it('should create MQTT not connected error', () => {
			const error = ErrorHelper.mqttNotConnected();

			expect(error.message).toBe('MQTT client is not connected');
		});

		it('should create FTP connection failed error', () => {
			const error = ErrorHelper.ftpConnectionFailed('192.168.1.100', 990, 'timeout');

			expect(error.message).toContain('192.168.1.100');
			expect(error.message).toContain('990');
			expect(error.message).toContain('timeout');
		});

		it('should create FTP auth failed error', () => {
			const error = ErrorHelper.ftpAuthFailed();

			expect(error.message).toContain('authentication');
			expect(error.message).toContain('access code');
		});

		it('should create file not found error', () => {
			const error = ErrorHelper.fileNotFound('/test/file.3mf');

			expect(error.message).toContain('File not found');
			expect(error.message).toContain('/test/file.3mf');
		});

		it('should create AMS not detected error', () => {
			const error = ErrorHelper.amsNotDetected();

			expect(error.message).toContain('AMS not detected');
		});
	});

	describe('enhanceError', () => {
		it('should enhance FTP connection errors', () => {
			const original = new Error('connect ECONNREFUSED');
			const enhanced = ErrorHelper.enhanceError(original);

			expect(enhanced.message).toContain('printer');
			expect(enhanced.message).toContain('online');
		});

		it('should enhance FTP authentication errors', () => {
			const original = new Error('530 Login authentication failed');
			const enhanced = ErrorHelper.enhanceError(original);

			expect(enhanced.message).toContain('authentication');
			expect(enhanced.message).toContain('access code');
		});

		it('should enhance permission errors', () => {
			const original = new Error('550 Permission denied to /sdcard/');
			const enhanced = ErrorHelper.enhanceError(original);

			expect(enhanced.message).toContain('Permission denied');
		});

		it('should return original error if no pattern matches', () => {
			const original = new Error('Some random error');
			const enhanced = ErrorHelper.enhanceError(original);

			expect(enhanced).toBe(original);
		});
	});

	describe('wrapError', () => {
		it('should wrap error with context', () => {
			const original = new Error('Original message');
			const wrapped = ErrorHelper.wrapError(original, 'Context');

			expect(wrapped.message).toBe('Context: Original message');
			expect(wrapped.stack).toBe(original.stack);
		});
	});

	describe('isConnectionError', () => {
		it('should identify connection errors', () => {
			expect(ErrorHelper.isConnectionError(new Error('ECONNREFUSED'))).toBe(true);
			expect(ErrorHelper.isConnectionError(new Error('ECONNRESET'))).toBe(true);
			expect(ErrorHelper.isConnectionError(new Error('ETIMEDOUT'))).toBe(true);
			expect(ErrorHelper.isConnectionError(new Error('Connection failed'))).toBe(true);
		});

		it('should not identify non-connection errors', () => {
			expect(ErrorHelper.isConnectionError(new Error('Authentication failed'))).toBe(false);
		});
	});

	describe('isAuthError', () => {
		it('should identify authentication errors', () => {
			expect(ErrorHelper.isAuthError(new Error('530 Login failed'))).toBe(true);
			expect(ErrorHelper.isAuthError(new Error('Authentication required'))).toBe(true);
		});

		it('should not identify non-auth errors', () => {
			expect(ErrorHelper.isAuthError(new Error('Connection timeout'))).toBe(false);
		});
	});
});
