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
import { Readable } from 'stream';

/**
 * FTP Helper for Bambu Lab Printer File Operations
 * Handles file upload, listing, and deletion via FTP/FTPS
 */
export class BambuLabFtpClient {
	private client: FTPClient;

	private credentials: BambuLabCredentials;

	private connectionTimeout = 15000; // 15 seconds

	constructor(credentials: BambuLabCredentials) {
		this.credentials = credentials;
		this.client = new FTPClient(this.connectionTimeout);
		// Enable verbose logging for debugging (can be disabled in production)
		// this.client.ftp.verbose = true;
	}

	/**
	 * Connect to the Bambu Lab printer via FTP/FTPS
	 */
	async connect(): Promise<void> {
		try {
			// Use FTPS (FTP over TLS) if the port is 990, otherwise plain FTP
			const useFTPS = this.credentials.ftpPort === 990;

			await this.client.access({
				host: this.credentials.printerIp,
				port: this.credentials.ftpPort,
				user: 'bblp',
				password: this.credentials.accessCode,
				secure: useFTPS,
				// Bambu Lab printers use self-signed certificates
				secureOptions: {
					rejectUnauthorized: false,
				},
			});
		} catch (error) {
			throw new Error(
				`Failed to connect to FTP server at ${this.credentials.printerIp}:${this.credentials.ftpPort}: ${(error as Error).message}`,
			);
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
		if (this.client.closed) {
			await this.connect();
		}

		try {
			const remotePath = options.remotePath || '/';
			const remoteFilePath = `${remotePath}/${options.fileName}`.replace('//', '/');

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
				message: `File ${options.fileName} uploaded successfully`,
				fileName: options.fileName,
				remotePath: remoteFilePath,
			};
		} catch (error) {
			const err = error as Error;
			if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
				throw new Error(
					`Cannot connect to FTP server at ${this.credentials.printerIp}:${this.credentials.ftpPort}. Is the printer online and Developer Mode enabled?`,
				);
			} else if (err.message.includes('530') || err.message.includes('Login')) {
				throw new Error(
					`FTP authentication failed. Please verify your access code in the credentials.`,
				);
			} else if (err.message.includes('550') || err.message.includes('permission')) {
				throw new Error(
					`Permission denied. The printer may not allow file uploads to this location: ${options.remotePath}`,
				);
			}
			throw new Error(`Failed to upload file: ${err.message}`);
		}
	}

	/**
	 * List files in a directory on the printer
	 * @param remotePath Path to list (default: root directory)
	 */
	async listFiles(remotePath = '/'): Promise<FileListResponse> {
		if (this.client.closed) {
			await this.connect();
		}

		try {
			const fileList = await this.client.list(remotePath);

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
		if (this.client.closed) {
			await this.connect();
		}

		try {
			await this.client.remove(remoteFilePath);

			return {
				success: true,
				message: `File ${remoteFilePath} deleted successfully`,
				fileName: remoteFilePath.split('/').pop() || remoteFilePath,
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
		if (this.client.closed) {
			await this.connect();
		}

		try {
			await this.client.downloadTo(localPath, remoteFilePath);
		} catch (error) {
			throw new Error(
				`Failed to download file ${remoteFilePath}: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Create a directory on the printer
	 * @param remotePath Path to create
	 */
	async createDirectory(remotePath: string): Promise<void> {
		if (this.client.closed) {
			await this.connect();
		}

		try {
			await this.client.ensureDir(remotePath);
		} catch (error) {
			throw new Error(`Failed to create directory ${remotePath}: ${(error as Error).message}`);
		}
	}

	/**
	 * Change the current working directory
	 * @param remotePath Path to change to
	 */
	async changeDirectory(remotePath: string): Promise<void> {
		if (this.client.closed) {
			await this.connect();
		}

		try {
			await this.client.cd(remotePath);
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
		if (this.client.closed) {
			await this.connect();
		}

		try {
			return await this.client.pwd();
		} catch (error) {
			throw new Error(`Failed to get current directory: ${(error as Error).message}`);
		}
	}

	/**
	 * Check if connected to FTP server
	 */
	getConnectionStatus(): boolean {
		return !this.client.closed;
	}

	/**
	 * Disconnect from the FTP server
	 */
	disconnect(): void {
		if (!this.client.closed) {
			this.client.close();
		}
	}
}
