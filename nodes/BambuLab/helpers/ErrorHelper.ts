import { ERROR_TEMPLATES } from './constants';

/**
 * Helper class for creating standardized error messages
 * Ensures consistent error formatting across the codebase
 */
export class ErrorHelper {
	/**
	 * Create MQTT connection timeout error
	 */
	static mqttConnectionTimeout(timeout: number): Error {
		return new Error(ERROR_TEMPLATES.MQTT_CONNECTION_TIMEOUT(timeout));
	}

	/**
	 * Create MQTT not connected error
	 */
	static mqttNotConnected(): Error {
		return new Error(ERROR_TEMPLATES.MQTT_NOT_CONNECTED);
	}

	/**
	 * Create FTP connection failed error
	 */
	static ftpConnectionFailed(ip: string, port: number, message: string): Error {
		return new Error(ERROR_TEMPLATES.FTP_CONNECTION_FAILED(ip, port, message));
	}

	/**
	 * Create FTP not connected error
	 */
	static ftpNotConnected(): Error {
		return new Error(ERROR_TEMPLATES.FTP_NOT_CONNECTED);
	}

	/**
	 * Create FTP authentication failed error
	 */
	static ftpAuthFailed(): Error {
		return new Error(ERROR_TEMPLATES.FTP_AUTH_FAILED);
	}

	/**
	 * Create FTP permission denied error
	 */
	static ftpPermissionDenied(path: string): Error {
		return new Error(ERROR_TEMPLATES.FTP_PERMISSION_DENIED(path));
	}

	/**
	 * Create file not found error
	 */
	static fileNotFound(path: string): Error {
		return new Error(ERROR_TEMPLATES.FILE_NOT_FOUND(path));
	}

	/**
	 * Create download timeout error
	 */
	static downloadTimeout(path: string): Error {
		return new Error(ERROR_TEMPLATES.DOWNLOAD_TIMEOUT(path));
	}

	/**
	 * Create status request timeout error
	 */
	static statusTimeout(timeout: number): Error {
		return new Error(ERROR_TEMPLATES.STATUS_TIMEOUT(timeout));
	}

	/**
	 * Create command response timeout error
	 */
	static commandResponseTimeout(timeout: number): Error {
		return new Error(ERROR_TEMPLATES.COMMAND_RESPONSE_TIMEOUT(timeout));
	}

	/**
	 * Create AMS not detected error
	 */
	static amsNotDetected(): Error {
		return new Error(ERROR_TEMPLATES.AMS_NOT_DETECTED);
	}

	/**
	 * Create filament not found error
	 */
	static filamentNotFound(type: string, color: string, index: number, available: string): Error {
		return new Error(ERROR_TEMPLATES.FILAMENT_NOT_FOUND(type, color, index, available));
	}

	/**
	 * Create printer offline error
	 */
	static printerOffline(): Error {
		return new Error(ERROR_TEMPLATES.PRINTER_OFFLINE);
	}

	/**
	 * Parse and enhance common error messages
	 * Detects error patterns and returns user-friendly messages
	 */
	static enhanceError(error: Error): Error {
		const message = error.message;

		// FTP connection errors
		if (message.includes('ECONNREFUSED') || message.includes('connect')) {
			return this.printerOffline();
		}

		// FTP authentication errors
		if (message.includes('530') || message.includes('Login')) {
			return this.ftpAuthFailed();
		}

		// FTP permission errors
		if (message.includes('550') || message.includes('permission')) {
			// Try to extract path from original error
			const pathMatch = message.match(/(?:to|at|in)\s+([^\s:]+)/);
			const path = pathMatch ? pathMatch[1] : 'unknown path';
			return this.ftpPermissionDenied(path);
		}

		// File not found errors
		if (message.includes('not found') || message.includes('404')) {
			const pathMatch = message.match(/(?:file|File)\s+([^\s:]+)/);
			const path = pathMatch ? pathMatch[1] : 'unknown file';
			return this.fileNotFound(path);
		}

		// Timeout errors
		if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
			if (message.toLowerCase().includes('download')) {
				const pathMatch = message.match(/(?:file|File)\s+([^\s:]+)/);
				const path = pathMatch ? pathMatch[1] : 'unknown file';
				return this.downloadTimeout(path);
			}
		}

		// Return original error if no pattern matches
		return error;
	}

	/**
	 * Wrap an error with additional context
	 */
	static wrapError(error: Error, context: string): Error {
		const wrappedError = new Error(`${context}: ${error.message}`);
		wrappedError.stack = error.stack;
		return wrappedError;
	}

	/**
	 * Check if error is a connection error
	 */
	static isConnectionError(error: Error): boolean {
		const connectionPatterns = [
			/ECONNREFUSED/i,
			/ECONNRESET/i,
			/ETIMEDOUT/i,
			/ENOTFOUND/i,
			/connection/i,
			/connect/i,
		];

		return connectionPatterns.some((pattern) => pattern.test(error.message));
	}

	/**
	 * Check if error is an authentication error
	 */
	static isAuthError(error: Error): boolean {
		const authPatterns = [/530/i, /login/i, /auth/i, /credential/i, /password/i];

		return authPatterns.some((pattern) => pattern.test(error.message));
	}
}
