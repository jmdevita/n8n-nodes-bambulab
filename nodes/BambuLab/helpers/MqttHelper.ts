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

	// Track active polling timers so disconnect can clear them and stop leaks
	// when an awaited promise is abandoned (e.g. workflow cancel).
	private activeTimers = new Set<NodeJS.Timeout>();

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
		return RetryHelper.withConditionalRetry(() => this.connectOnce(), {
			maxRetries: 2, // Try up to 3 times total (initial + 2 retries)
			onRetry: (attempt, error) => {
				console.warn(`MQTT connection attempt ${attempt} failed: ${error.message}. Retrying...`);
			},
		});
	}

	/**
	 * Internal method for single connection attempt
	 */
	private async connectOnce(): Promise<void> {
		// Clean up any existing client before creating a new one (prevents orphaned connections)
		if (this.client) {
			try {
				this.client.removeAllListeners();
				this.client.end(true);
			} catch {
				// Ignore cleanup errors
			}
			this.client = null;
		}

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

			let settled = false;
			const settleOnce = (fn: () => void) => {
				if (!settled) {
					settled = true;
					fn();
				}
			};

			try {
				this.client = mqtt.connect(brokerUrl, options);
				const client = this.client; // Capture so handlers reference the same instance

				// Always-on message handler (active before and after connect)
				const onMessage = (_topic: string, message: Buffer) => {
					try {
						const parsedMessage = JSON.parse(message.toString()) as MQTTMessage;

						// Enforce buffer size limit (prevent memory leaks)
						if (this.messageBuffer.length >= LIMITS.MAX_MESSAGE_BUFFER) {
							this.messageBuffer.shift(); // Remove oldest message
						}
						this.messageBuffer.push(parsedMessage);
					} catch (error) {
						console.error('Failed to parse MQTT message:', (error as Error).message);
					}
				};
				client.on('message', onMessage);

				// Connection timeout (only fires if connect never completes)
				const timeout = setTimeout(() => {
					settleOnce(() => {
						client.removeAllListeners();
						client.end(true);
						if (this.client === client) {
							this.client = null;
						}
						reject(ErrorHelper.mqttConnectionTimeout(this.connectionTimeout));
					});
				}, this.connectionTimeout);

				// Connect-only handlers — rejected if anything goes wrong before subscribe ACKs.
				// After subscribe succeeds, we detach these and install runtime handlers that
				// don't null out this.client mid-operation.
				const onConnectError = (error: Error) => {
					clearTimeout(timeout);
					settleOnce(() => {
						client.removeAllListeners();
						client.end(true);
						if (this.client === client) {
							this.client = null;
						}
						reject(new Error(`MQTT connection error: ${error.message}`));
					});
				};
				const onConnectClose = () => {
					clearTimeout(timeout);
					settleOnce(() => {
						if (this.client === client) {
							this.client = null;
						}
						reject(new Error('MQTT connection closed unexpectedly'));
					});
				};
				client.on('error', onConnectError);
				client.on('close', onConnectClose);

				// Connection successful
				client.on('connect', () => {
					// Subscribe to printer reports
					client.subscribe(this.reportTopic, (err) => {
						if (err) {
							clearTimeout(timeout);
							settleOnce(() => {
								client.removeAllListeners();
								client.end(true);
								if (this.client === client) {
									this.client = null;
								}
								reject(new Error(`Failed to subscribe to ${this.reportTopic}: ${err.message}`));
							});
							return;
						}

						clearTimeout(timeout);
						// Swap connect-only handlers for runtime handlers so a later
						// broker-initiated close doesn't null out this.client mid-operation.
						client.removeListener('error', onConnectError);
						client.removeListener('close', onConnectClose);

						client.on('error', (error) => {
							// Surface errors without tearing down — disconnect() owns lifecycle.
							console.warn(`MQTT runtime error: ${error.message}`);
						});

						settleOnce(() => resolve());
					});
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

		// QoS 0 is intentional. Bambu P1/A1 firmware has a known bug where a
		// QoS 1 PUBLISH whose PUBACK we don't await leaves the broker in a
		// stuck single-client slot state — subsequent connects fail with
		// connack timeout until the printer is power-cycled. mqtt.js end(false)
		// then hangs on outgoingEmpty because no PUBACK ever closes the loop.
		// Going QoS 0 makes end() proceed straight to DISCONNECT, which the
		// broker releases cleanly. We don't lose anything functional: TCP
		// already guarantees delivery on LAN, our application-level correlation
		// is via the report topic + sequence_id (not PUBACK), and pybambu (the
		// reference HA implementation) uses QoS 0 for all publishes too.
		// Refs: ha-bambulab#174, BambuStudio#2404.
		this.client.publish(this.requestTopic, commandStr, { qos: 0 });

		// If not waiting for response, return immediately
		if (!waitForResponse) {
			return {
				success: true,
				message: 'Command sent successfully',
				sequence_id: commandSeqId,
			};
		}

		// Wait for printer response strictly matching sequence_id.
		// The Bambu protocol streams continuous status updates; the "take last
		// message" fallback used to return unrelated status as the ACK. We
		// require an exact sequence_id match and reject on timeout.
		return new Promise((resolve, reject) => {
			let timeout: NodeJS.Timeout | null = null;
			let checkInterval: NodeJS.Timeout | null = null;

			const cleanup = () => {
				if (timeout) {
					clearTimeout(timeout);
					this.activeTimers.delete(timeout);
				}
				if (checkInterval) {
					clearInterval(checkInterval);
					this.activeTimers.delete(checkInterval);
				}
			};

			timeout = setTimeout(() => {
				cleanup();
				reject(ErrorHelper.commandResponseTimeout(this.responseTimeout));
			}, this.responseTimeout);
			this.activeTimers.add(timeout);

			// Poll for a sequence_id-matched response. Without a sequence_id we
			// can't correlate at all, so just resolve as fire-and-forget.
			if (!commandSeqId) {
				cleanup();
				resolve({
					success: true,
					message: 'Command sent (no sequence_id to correlate response)',
				});
				return;
			}

			checkInterval = setInterval(() => {
				if (this.messageBuffer.length === 0) return;

				const response = this.messageBuffer.find(
					(msg) =>
						msg.print?.sequence_id === commandSeqId ||
						msg.pushing?.sequence_id === commandSeqId ||
						msg.system?.sequence_id === commandSeqId ||
						msg.gcode_line?.sequence_id === commandSeqId,
				);

				if (response) {
					cleanup();
					resolve({
						success: true,
						message: 'Command executed and response received',
						data: response,
						sequence_id: commandSeqId,
					});
				}
			}, INTERVALS.MESSAGE_POLL);
			this.activeTimers.add(checkInterval);
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

		// QoS 0 — see publishCommand for rationale. Status queries don't need
		// broker-level ack guarantees; printer response arrives via the report
		// topic which we poll for in messageBuffer.
		this.client.publish(this.requestTopic, JSON.stringify(pushCommand), { qos: 0 });

		// Wait for printer response (not publish callback)
		return new Promise((resolve, reject) => {
			let timeout: NodeJS.Timeout | null = null;
			let checkInterval: NodeJS.Timeout | null = null;

			const cleanup = () => {
				if (timeout) {
					clearTimeout(timeout);
					this.activeTimers.delete(timeout);
				}
				if (checkInterval) {
					clearInterval(checkInterval);
					this.activeTimers.delete(checkInterval);
				}
			};

			timeout = setTimeout(() => {
				cleanup();
				reject(ErrorHelper.statusTimeout(this.responseTimeout));
			}, this.responseTimeout);
			this.activeTimers.add(timeout);

			checkInterval = setInterval(() => {
				if (this.messageBuffer.length === 0) return;

				// Prefer messages with AMS data — that's the full status payload
				// the pushall request asks for. Status reports without AMS are
				// partial telemetry and don't contain the data the caller wants.
				const status = this.messageBuffer.find(
					(msg) => (msg as any).print?.ams !== undefined,
				) as PrinterStatus | undefined;

				if (status) {
					cleanup();
					resolve(status);
				}
			}, INTERVALS.MESSAGE_POLL);
			this.activeTimers.add(checkInterval);
		});
	}

	/**
	 * Clear all tracked polling timers. Called on disconnect to stop pollers
	 * whose awaiting promises have been abandoned.
	 */
	private clearActiveTimers(): void {
		for (const timer of this.activeTimers) {
			clearTimeout(timer);
			clearInterval(timer);
		}
		this.activeTimers.clear();
	}

	/**
	 * Disconnect from the printer with timeout
	 * Attempts graceful disconnect, but falls back to force disconnect if callback doesn't fire
	 */
	async disconnect(): Promise<void> {
		this.clearActiveTimers();

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
					this.client.removeAllListeners();
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
					this.client.end(false, undefined, () => {
						if (!disconnected) {
							clearTimeout(timeout);
							this.client?.removeAllListeners();
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
					this.client.removeAllListeners();
					this.client.end(true);
					this.client = null;
					this.messageBuffer = [];
					disconnected = true;
				}
				resolve();
			}
		});
	}

}
