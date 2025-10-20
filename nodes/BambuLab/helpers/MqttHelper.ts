import * as mqtt from 'mqtt';
import type { MqttClient, IClientOptions } from 'mqtt';
import type {
	BambuLabCredentials,
	PrinterStatus,
	MQTTMessage,
	CommandResponse,
	AnyCommand,
} from './types';

/**
 * MQTT Helper for Bambu Lab Printer Communication
 * Handles connection, command publishing, and status subscription
 */
export class BambuLabMqttClient {
	private client: MqttClient | null = null;

	private credentials: BambuLabCredentials;

	private reportTopic: string;

	private requestTopic: string;

	private messageBuffer: MQTTMessage[] = [];

	private connectionTimeout = 10000; // 10 seconds

	private responseTimeout = 30000; // 30 seconds

	private updateCallback?: (status: PrinterStatus) => void;

	constructor(credentials: BambuLabCredentials) {
		this.credentials = credentials;
		this.reportTopic = `device/${credentials.serialNumber}/report`;
		this.requestTopic = `device/${credentials.serialNumber}/request`;
	}

	/**
	 * Connect to the Bambu Lab printer via MQTT
	 */
	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			const protocol = this.credentials.useTls ? 'mqtts' : 'mqtt';
			const brokerUrl = `${protocol}://${this.credentials.printerIp}:${this.credentials.mqttPort}`;

			const options: IClientOptions = {
				username: 'bblp',
				password: this.credentials.accessCode,
				protocol: this.credentials.useTls ? 'mqtts' : 'mqtt',
				port: this.credentials.mqttPort,
				// Bambu Lab printers use self-signed certificates
				rejectUnauthorized: false,
				connectTimeout: this.connectionTimeout,
				reconnectPeriod: 0, // Disable auto-reconnect, we'll handle it manually
			};

			try {
				this.client = mqtt.connect(brokerUrl, options);

				// Connection timeout
				const timeout = setTimeout(() => {
					this.client?.end(true);
					reject(
						new Error(
							`MQTT connection timeout after ${this.connectionTimeout}ms. Please check printer IP and network connection.`,
						),
					);
				}, this.connectionTimeout);

				// Connection successful
				this.client.on('connect', () => {
					clearTimeout(timeout);
					// Subscribe to printer reports
					this.client?.subscribe(this.reportTopic, (err) => {
						if (err) {
							reject(new Error(`Failed to subscribe to ${this.reportTopic}: ${err.message}`));
						} else {
							resolve();
						}
					});
				});

				// Connection error
				this.client.on('error', (error) => {
					clearTimeout(timeout);
					reject(new Error(`MQTT connection error: ${error.message}`));
				});

				// Handle incoming messages
				this.client.on('message', (topic, message) => {
					try {
						const parsedMessage = JSON.parse(message.toString()) as MQTTMessage;
						this.messageBuffer.push(parsedMessage);

						// Also call the update callback if registered
						if (this.updateCallback && topic === this.reportTopic) {
							this.updateCallback(parsedMessage as PrinterStatus);
						}
					} catch (error) {
						console.error('Failed to parse MQTT message:', error);
					}
				});
			} catch (error) {
				reject(new Error(`Failed to create MQTT client: ${(error as Error).message}`));
			}
		});
	}

	/**
	 * Publish a command to the printer
	 * Note: Does not wait for publish callback due to mqtt.js callback reliability issues
	 */
	async publishCommand(command: AnyCommand, waitForResponse = false): Promise<CommandResponse> {
		if (!this.client || !this.client.connected) {
			throw new Error('MQTT client is not connected');
		}

		// Clear message buffer if we're waiting for a response
		if (waitForResponse) {
			this.messageBuffer = [];
		}

		const commandStr = JSON.stringify(command);

		// Extract sequence_id from the command
		const commandSeqId =
			'print' in command
				? command.print.sequence_id
				: 'pushing' in command
					? command.pushing.sequence_id
					: 'system' in command && command.system
						? command.system.sequence_id
						: 'gcode_line' in command
							? command.gcode_line.sequence_id
							: undefined;

		// Publish without waiting for callback (mqtt.js has known callback reliability issues)
		this.client.publish(this.requestTopic, commandStr, { qos: 1 });

		// If not waiting for response, return immediately
		if (!waitForResponse) {
			return {
				success: true,
				message: 'Command sent successfully',
				sequence_id: commandSeqId,
			};
		}

		// Wait for printer response (not publish callback)
		return new Promise((resolve, reject) => {
			let timeout: NodeJS.Timeout | null = null;
			let checkInterval: NodeJS.Timeout | null = null;

			const cleanup = () => {
				if (timeout) clearTimeout(timeout);
				if (checkInterval) clearInterval(checkInterval);
			};

			timeout = setTimeout(() => {
				cleanup();
				reject(new Error(`Command response timeout after ${this.responseTimeout}ms`));
			}, this.responseTimeout);

			// Poll for response in message buffer
			checkInterval = setInterval(() => {
				if (this.messageBuffer.length > 0) {
					let response: MQTTMessage | undefined;

					// If we have a sequence ID, try to find matching response
					if (commandSeqId) {
						response = this.messageBuffer.find(
							(msg) =>
								msg.print?.sequence_id === commandSeqId ||
								msg.pushing?.sequence_id === commandSeqId ||
								msg.system?.sequence_id === commandSeqId ||
								msg.gcode_line?.sequence_id === commandSeqId,
						);
					}

					// Fallback: if no sequence ID or no match found, take the last message
					if (!response) {
						response = this.messageBuffer[this.messageBuffer.length - 1];
					}

					// If we found a response, return it
					if (response) {
						cleanup();
						this.messageBuffer = [];

						resolve({
							success: true,
							message: 'Command executed and response received',
							data: response,
						});
					}
				}
			}, 100);
		});
	}

	/**
	 * Get current printer status
	 * Sends a "pushall" command and waits for the response
	 * Note: Does not wait for publish callback due to mqtt.js callback reliability issues
	 */
	async getStatus(): Promise<PrinterStatus> {
		if (!this.client || !this.client.connected) {
			throw new Error('MQTT client is not connected');
		}

		// Clear message buffer
		this.messageBuffer = [];

		// Send pushall command to request full status
		const pushCommand = {
			pushing: {
				sequence_id: Date.now().toString(),
				command: 'pushall',
				version: 1,
				push_target: 1,
			},
		};

		// Publish without waiting for callback (mqtt.js has known callback reliability issues)
		this.client.publish(this.requestTopic, JSON.stringify(pushCommand), { qos: 1 });

		// Wait for printer response (not publish callback)
		return new Promise((resolve, reject) => {
			let timeout: NodeJS.Timeout | null = null;
			let checkInterval: NodeJS.Timeout | null = null;

			const cleanup = () => {
				if (timeout) clearTimeout(timeout);
				if (checkInterval) clearInterval(checkInterval);
			};

			timeout = setTimeout(() => {
				cleanup();
				reject(new Error(`Status request timeout after ${this.responseTimeout}ms`));
			}, this.responseTimeout);

			// Poll for response in message buffer
			const expectedSeqId = pushCommand.pushing.sequence_id;

			checkInterval = setInterval(() => {
				if (this.messageBuffer.length > 0) {
					let status: PrinterStatus | undefined;

					// Try to find the response matching our sequence ID
					status = this.messageBuffer.find(
						(msg) => msg.pushing?.sequence_id === expectedSeqId,
					) as PrinterStatus | undefined;

					// Fallback: if no match found, take the last message
					if (!status) {
						status = this.messageBuffer[this.messageBuffer.length - 1] as PrinterStatus;
					}

					// If we found a status, return it
					if (status) {
						cleanup();
						this.messageBuffer = [];

						resolve(status);
					}
				}
			}, 100);
		});
	}

	/**
	 * Subscribe to printer status updates with a callback
	 * Useful for real-time monitoring
	 */
	subscribeToUpdates(callback: (status: PrinterStatus) => void): void {
		if (!this.client) {
			throw new Error('MQTT client is not initialized');
		}

		// Store the callback - will be invoked by the existing message handler
		this.updateCallback = callback;
	}

	/**
	 * Get the MQTT client instance (for advanced usage)
	 */
	getClient(): MqttClient | null {
		return this.client;
	}

	/**
	 * Check if the client is connected
	 */
	isConnected(): boolean {
		return this.client?.connected ?? false;
	}

	/**
	 * Disconnect from the printer with timeout
	 * Attempts graceful disconnect, but falls back to force disconnect if callback doesn't fire
	 */
	async disconnect(): Promise<void> {
		if (!this.client) {
			return;
		}

		return new Promise<void>((resolve) => {
			const disconnectTimeout = 3000; // 3 seconds max wait
			let disconnected = false;

			// Set timeout to force disconnect if graceful takes too long
			const timeout = setTimeout(() => {
				if (!disconnected && this.client) {
					console.warn('Graceful disconnect timeout, forcing disconnect');
					this.client.end(true); // Force close
					this.client = null;
					this.messageBuffer = [];
					disconnected = true;
					resolve();
				}
			}, disconnectTimeout);

			// Try graceful disconnect
			try {
				if (this.client) {
					this.client.end(false, {}, () => {
						if (!disconnected) {
							clearTimeout(timeout);
							this.client = null;
							this.messageBuffer = [];
							disconnected = true;
							resolve();
						}
					});
				} else {
					clearTimeout(timeout);
					resolve();
				}
			} catch (error) {
				// If graceful fails, force disconnect
				clearTimeout(timeout);
				if (!disconnected && this.client) {
					this.client.end(true);
					this.client = null;
					this.messageBuffer = [];
					disconnected = true;
				}
				resolve();
			}
		});
	}

	/**
	 * Force disconnect (immediate)
	 */
	forceDisconnect(): void {
		if (this.client) {
			this.client.end(true);
			this.client = null;
			this.messageBuffer = [];
		}
	}
}
