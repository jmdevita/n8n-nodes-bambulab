import { Client as FTPClient } from 'basic-ftp';
import type {
	BambuLabCredentials,
	FTPUploadOptions,
	FTPFileInfo,
	FTPUploadProgress,
	FileUploadResponse,
	FileListResponse,
	FileDeleteResponse,
} from './types';
import { Readable, Writable } from 'stream';
import { TIMEOUTS, PRINTER_DEFAULTS } from './constants';
import { ErrorHelper } from './ErrorHelper';
import { RetryHelper } from './RetryHelper';
import { PathValidator } from './PathValidator';

/**
 * FTP Helper for Bambu Lab Printer File Operations
 * Handles file upload, listing, and deletion via FTP/FTPS
 */
export class BambuLabFtpClient {
	private client: FTPClient;

	private credentials: BambuLabCredentials;

	private connectionTimeout = TIMEOUTS.FTP_CONNECTION;

	private isConnected = false;

	constructor(credentials: BambuLabCredentials) {
		this.credentials = credentials;
		this.client = new FTPClient(this.connectionTimeout);
		// Enable verbose logging for debugging (can be disabled in production)
		// this.client.ftp.verbose = true;
	}

	/**
	 * Connect to the Bambu Lab printer via FTP/FTPS
	 * Includes retry logic for transient connection failures
	 */
	async connect(): Promise<void> {
		return RetryHelper.withConditionalRetry(
			() => this.connectOnce(),
			{
				maxRetries: 2, // Try up to 3 times total (initial + 2 retries)
				onRetry: (attempt, error) => {
					console.warn(`FTP connection attempt ${attempt} failed: ${error.message}. Retrying...`);
				},
			}
		);
	}

	/**
	 * Internal method for single connection attempt
	 */
	private async connectOnce(): Promise<void> {
		try {
			// Port 990 uses implicit FTPS (TLS from the start)
			// Other ports use explicit FTPS or plain FTP
			const secureMode = this.credentials.ftpPort === 990 ? 'implicit' : true;

			await this.client.access({
				host: this.credentials.printerIp,
				port: this.credentials.ftpPort,
				user: PRINTER_DEFAULTS.FTP_USERNAME,
				password: this.credentials.accessCode,
				secure: secureMode,
				// Bambu Lab printers use self-signed certificates
				secureOptions: {
					rejectUnauthorized: false,
				},
			});

			this.isConnected = true;
		} catch (error) {
			this.isConnected = false;
			throw ErrorHelper.ftpConnectionFailed(
				this.credentials.printerIp,
				this.credentials.ftpPort,
				(error as Error).message
			);
		}
	}

	/**
	 * Ensure connection is established before operations
	 * More robust than checking client.closed alone
	 */
	private async ensureConnection(): Promise<void> {
		if (!this.isConnected || this.client.closed) {
			await this.connect();
		}
	}

	/**
	 * Upload a file to the printer
	 * @param options Upload options including file content and destination
	 * @param progressCallback Optional callback for upload progress
	 */
	async uploadFile(
		options: FTPUploadOptions,
		progressCallback?: (progress: FTPUploadProgress) => void,
	): Promise<FileUploadResponse> {
		await this.ensureConnection();

		try {
			// Sanitize inputs to prevent path traversal
			const sanitizedFilename = PathValidator.sanitizeFilename(options.fileName);
			const sanitizedPath = PathValidator.sanitizePath(options.remotePath || '/');

			// Use safe join to combine paths
			const remoteFilePath = PathValidator.safeJoin(sanitizedPath, sanitizedFilename);

			// Track upload progress if callback is provided
			if (progressCallback && options.fileContent) {
				const totalBytes =
					typeof options.fileContent === 'string'
						? Buffer.byteLength(options.fileContent)
						: options.fileContent.length;
				let bytesTransferred = 0;

				this.client.trackProgress((info) => {
					bytesTransferred = info.bytes;
					progressCallback({
						fileName: options.fileName,
						bytesTransferred,
						totalBytes,
						percentage: Math.round((bytesTransferred / totalBytes) * 100),
					});
				});
			}

			try {
				// Upload from local file path
				if (options.localPath) {
					await this.client.uploadFrom(options.localPath, remoteFilePath);
				}
				// Upload from buffer or string
				else if (options.fileContent) {
					let stream: Readable;

					if (typeof options.fileContent === 'string') {
						stream = Readable.from([options.fileContent]);
					} else {
						stream = Readable.from([options.fileContent]);
					}

					await this.client.uploadFrom(stream, remoteFilePath);
				} else {
					throw new Error('Either localPath or fileContent must be provided');
				}
			} finally {
				// Always stop tracking progress
				this.client.trackProgress();
			}

			return {
				success: true,
				message: `File ${sanitizedFilename} uploaded successfully`,
				fileName: sanitizedFilename,
				remotePath: remoteFilePath,
			};
		} catch (error) {
			const err = error as Error;

			// Use ErrorHelper to provide user-friendly messages
			if (ErrorHelper.isConnectionError(err)) {
				throw ErrorHelper.printerOffline();
			} else if (ErrorHelper.isAuthError(err)) {
				throw ErrorHelper.ftpAuthFailed();
			} else if (err.message.includes('550') || err.message.includes('permission')) {
				throw ErrorHelper.ftpPermissionDenied(options.remotePath || '/');
			}

			throw ErrorHelper.wrapError(err, 'Failed to upload file');
		}
	}

	/**
	 * List files in a directory on the printer
	 * @param remotePath Path to list (default: root directory)
	 */
	async listFiles(remotePath = '/'): Promise<FileListResponse> {
		await this.ensureConnection();

		try {
			// Sanitize path to prevent traversal
			const sanitizedPath = PathValidator.sanitizePath(remotePath);

			const fileList = await this.client.list(sanitizedPath);

			const files: FTPFileInfo[] = fileList.map((file) => ({
				name: file.name,
				type: file.isDirectory ? 'directory' : 'file',
				size: file.size,
				modifiedTime: file.modifiedAt,
				permissions: file.permissions,
			}));

			return {
				success: true,
				files,
			};
		} catch (error) {
			throw new Error(`Failed to list files in ${remotePath}: ${(error as Error).message}`);
		}
	}

	/**
	 * Delete a file from the printer
	 * @param remoteFilePath Full path to the file to delete
	 */
	async deleteFile(remoteFilePath: string): Promise<FileDeleteResponse> {
		await this.ensureConnection();

		try {
			// Sanitize path to prevent traversal
			const sanitizedPath = PathValidator.sanitizePath(remoteFilePath);

			await this.client.remove(sanitizedPath);

			return {
				success: true,
				message: `File ${sanitizedPath} deleted successfully`,
				fileName: sanitizedPath.split('/').pop() || sanitizedPath,
			};
		} catch (error) {
			throw new Error(`Failed to delete file ${remoteFilePath}: ${(error as Error).message}`);
		}
	}

	/**
	 * Download a file from the printer
	 * @param remoteFilePath Path to the file on the printer
	 * @param localPath Local path to save the file
	 */
	async downloadFile(remoteFilePath: string, localPath: string): Promise<void> {
		await this.ensureConnection();

		try {
			// Sanitize remote path to prevent traversal
			const sanitizedRemotePath = PathValidator.sanitizePath(remoteFilePath);

			await this.client.downloadTo(localPath, sanitizedRemotePath);
		} catch (error) {
			throw new Error(
				`Failed to download file ${remoteFilePath}: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Download a file from the printer and return as Buffer
	 * Used for parsing .3mf files for auto-detection
	 * @param remoteFilePath Path to the file on the printer
	 * @returns Buffer containing the file data
	 */
	async downloadFileAsBuffer(remoteFilePath: string): Promise<Buffer> {
		await this.ensureConnection();

		try {
			// Sanitize path to prevent traversal
			const sanitizedPath = PathValidator.sanitizePath(remoteFilePath);

			// Create a writable stream that collects chunks into a buffer
			const chunks: Buffer[] = [];
			const writableStream = new Writable({
				write(chunk: Buffer, _encoding: string, callback: () => void) {
					chunks.push(chunk);
					callback();
				},
			});

			// Set timeout for large files
			const oldTimeout = this.client.ftp.socket?.timeout;
			if (this.client.ftp.socket) {
				this.client.ftp.socket.setTimeout(TIMEOUTS.FTP_DOWNLOAD);
			}

			try {
				await this.client.downloadTo(writableStream, sanitizedPath);
			} finally {
				// Restore original timeout
				if (this.client.ftp.socket && oldTimeout !== undefined) {
					this.client.ftp.socket.setTimeout(oldTimeout);
				}
			}

			// Combine all chunks into a single buffer
			return Buffer.concat(chunks);
		} catch (error) {
			const err = error as Error;

			// Provide helpful error messages using ErrorHelper
			if (err.message.includes('550') || err.message.includes('not found')) {
				throw ErrorHelper.fileNotFound(remoteFilePath);
			} else if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
				throw ErrorHelper.downloadTimeout(remoteFilePath);
			}

			throw ErrorHelper.wrapError(err, `Failed to download file ${remoteFilePath}`);
		}
	}

	/**
	 * Create a directory on the printer
	 * @param remotePath Path to create
	 */
	async createDirectory(remotePath: string): Promise<void> {
		await this.ensureConnection();

		try {
			// Sanitize path to prevent traversal
			const sanitizedPath = PathValidator.sanitizePath(remotePath);

			await this.client.ensureDir(sanitizedPath);
		} catch (error) {
			throw new Error(`Failed to create directory ${remotePath}: ${(error as Error).message}`);
		}
	}

	/**
	 * Change the current working directory
	 * @param remotePath Path to change to
	 */
	async changeDirectory(remotePath: string): Promise<void> {
		await this.ensureConnection();

		try {
			// Sanitize path to prevent traversal
			const sanitizedPath = PathValidator.sanitizePath(remotePath);

			await this.client.cd(sanitizedPath);
		} catch (error) {
			throw new Error(
				`Failed to change directory to ${remotePath}: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Get the current working directory
	 */
	async getCurrentDirectory(): Promise<string> {
		await this.ensureConnection();

		try {
			return await this.client.pwd();
		} catch (error) {
			throw new Error(`Failed to get current directory: ${(error as Error).message}`);
		}
	}

	/**
	 * Check if connected to FTP server
	 * More reliable than checking client.closed alone
	 */
	getConnectionStatus(): boolean {
		return this.isConnected && !this.client.closed;
	}

	/**
	 * Disconnect from the FTP server
	 */
	disconnect(): void {
		if (!this.client.closed) {
			this.client.close();
		}
		this.isConnected = false;
	}
}
