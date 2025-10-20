import * as mqtt from 'mqtt';
import type { MqttClient, IClientOptions } from 'mqtt';
import type {
	BambuLabCredentials,
	PrinterStatus,
	MQTTMessage,
	CommandResponse,
	AnyCommand,
} from './types';
import { TIMEOUTS, INTERVALS, LIMITS, PRINTER_DEFAULTS } from './constants';
import { ErrorHelper } from './ErrorHelper';
import { RetryHelper } from './RetryHelper';

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

	private connectionTimeout = TIMEOUTS.MQTT_CONNECTION;

	private responseTimeout = TIMEOUTS.MQTT_RESPONSE;

	private updateCallback?: (status: PrinterStatus) => void;

	private lastParseError: Error | null = null;

	private parseErrorHistory: Array<{ timestamp: Date; error: Error }> = [];

	constructor(credentials: BambuLabCredentials) {
		this.credentials = credentials;
		this.reportTopic = `device/${credentials.serialNumber}/report`;
		this.requestTopic = `device/${credentials.serialNumber}/request`;
	}

	/**
	 * Connect to the Bambu Lab printer via MQTT
	 * Includes retry logic for transient connection failures
	 */
	async connect(): Promise<void> {
		return RetryHelper.withConditionalRetry(
			() => this.connectOnce(),
			{
				maxRetries: 2, // Try up to 3 times total (initial + 2 retries)
				onRetry: (attempt, error) => {
					console.warn(`MQTT connection attempt ${attempt} failed: ${error.message}. Retrying...`);
				},
			}
		);
	}

	/**
	 * Internal method for single connection attempt
	 */
	private async connectOnce(): Promise<void> {
		return new Promise((resolve, reject) => {
			const protocol = this.credentials.useTls ? 'mqtts' : 'mqtt';
			const brokerUrl = `${protocol}://${this.credentials.printerIp}:${this.credentials.mqttPort}`;

			const options: IClientOptions = {
				username: PRINTER_DEFAULTS.MQTT_USERNAME,
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
					reject(ErrorHelper.mqttConnectionTimeout(this.connectionTimeout));
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

						// Enforce buffer size limit (prevent memory leaks)
						if (this.messageBuffer.length >= LIMITS.MAX_MESSAGE_BUFFER) {
							this.messageBuffer.shift(); // Remove oldest message
						}
						this.messageBuffer.push(parsedMessage);

						// Also call the update callback if registered
						if (this.updateCallback && topic === this.reportTopic) {
							this.updateCallback(parsedMessage as PrinterStatus);
						}
					} catch (error) {
						// Track parse errors for debugging
						const parseError = error as Error;
						this.lastParseError = parseError;
						this.parseErrorHistory.push({
							timestamp: new Date(),
							error: parseError,
						});

						// Keep only last 10 parse errors
						if (this.parseErrorHistory.length > 10) {
							this.parseErrorHistory.shift();
						}

						console.error('Failed to parse MQTT message:', parseError.message);
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
			throw ErrorHelper.mqttNotConnected();
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
				reject(ErrorHelper.commandResponseTimeout(this.responseTimeout));
			}, this.responseTimeout);

			// Poll for response in message buffer (optimized interval)
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
			}, INTERVALS.MESSAGE_POLL); // Optimized from 100ms to 250ms
		});
	}

	/**
	 * Get current printer status
	 * Sends a "pushall" command and waits for the response
	 * Note: Does not wait for publish callback due to mqtt.js callback reliability issues
	 */
	async getStatus(): Promise<PrinterStatus> {
		if (!this.client || !this.client.connected) {
			throw ErrorHelper.mqttNotConnected();
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
				reject(ErrorHelper.statusTimeout(this.responseTimeout));
			}, this.responseTimeout);

			// Poll for response in message buffer (optimized interval)
			const expectedSeqId = pushCommand.pushing.sequence_id;

			checkInterval = setInterval(() => {
				if (this.messageBuffer.length > 0) {
					let status: PrinterStatus | undefined;

					// Prefer messages that have AMS data (more complete status)
					// This ensures we get the full printer state, not just a partial update
					status = this.messageBuffer.find(
						(msg) => (msg as any).print?.ams !== undefined,
					) as PrinterStatus | undefined;

					// Fallback: if no AMS data found, try matching sequence ID
					if (!status) {
						status = this.messageBuffer.find(
							(msg) => msg.pushing?.sequence_id === expectedSeqId,
						) as PrinterStatus | undefined;
					}

					// Final fallback: take the last message
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
			}, INTERVALS.MESSAGE_POLL); // Optimized from 100ms to 250ms
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
	 * Clear the message buffer
	 * Useful for cleanup or resetting state
	 */
	clearMessageBuffer(): void {
		this.messageBuffer = [];
	}

	/**
	 * Get the last parse error (if any)
	 * Useful for debugging message parsing issues
	 */
	getLastParseError(): Error | null {
		return this.lastParseError;
	}

	/**
	 * Get parse error history
	 * Returns the last 10 parse errors with timestamps
	 */
	getParseErrorHistory(): Array<{ timestamp: Date; error: Error }> {
		return [...this.parseErrorHistory]; // Return copy to prevent external modification
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
			const disconnectTimeout = TIMEOUTS.GRACEFUL_DISCONNECT;
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
