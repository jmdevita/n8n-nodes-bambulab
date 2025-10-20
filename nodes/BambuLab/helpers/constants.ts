/**
 * Constants for Bambu Lab node configuration
 * Centralizes timeouts, limits, and default values
 */

// ==================== Connection Timeouts ====================
export const TIMEOUTS = {
	/** MQTT connection timeout in milliseconds */
	MQTT_CONNECTION: 10000, // 10 seconds
	/** MQTT response timeout for status requests in milliseconds */
	MQTT_RESPONSE: 30000, // 30 seconds
	/** FTP connection timeout in milliseconds */
	FTP_CONNECTION: 15000, // 15 seconds
	/** Graceful disconnect timeout in milliseconds */
	GRACEFUL_DISCONNECT: 3000, // 3 seconds
	/** FTP download timeout for large files in milliseconds */
	FTP_DOWNLOAD: 30000, // 30 seconds
} as const;

// ==================== Polling & Intervals ====================
export const INTERVALS = {
	/** Polling interval for MQTT message buffer in milliseconds */
	MESSAGE_POLL: 250, // 250ms (optimized from 100ms)
} as const;

// ==================== Buffer Limits ====================
export const LIMITS = {
	/** Maximum MQTT message buffer size before oldest messages are discarded */
	MAX_MESSAGE_BUFFER: 100,
} as const;

// ==================== Printer Defaults ====================
export const PRINTER_DEFAULTS = {
	/** Default MQTT port for secure connection */
	MQTT_PORT: 8883,
	/** Default FTP port for FTPS */
	FTP_PORT: 990,
	/** Default MQTT username */
	MQTT_USERNAME: 'bblp',
	/** Default FTP username */
	FTP_USERNAME: 'bblp',
} as const;

// ==================== Printer Limits ====================
export const PRINTER_LIMITS = {
	/** Maximum print speed percentage */
	MAX_SPEED: 166,
	/** Minimum print speed percentage */
	MIN_SPEED: 50,
	/** Maximum fan speed percentage */
	MAX_FAN_SPEED: 100,
	/** Minimum fan speed percentage */
	MIN_FAN_SPEED: 0,
} as const;

// ==================== Retry Configuration ====================
export const RETRY_CONFIG = {
	/** Maximum number of retry attempts */
	MAX_RETRIES: 3,
	/** Initial delay before first retry in milliseconds */
	INITIAL_DELAY: 1000, // 1 second
	/** Maximum delay between retries in milliseconds */
	MAX_DELAY: 10000, // 10 seconds
	/** Backoff multiplier for exponential backoff */
	BACKOFF_MULTIPLIER: 2,
} as const;

// ==================== File Paths ====================
export const FILE_PATHS = {
	/** Default SD card path for A1 series */
	A1_SDCARD_PATH: '/sdcard/',
	/** Default cache path for X1/P1 series */
	X1_CACHE_PATH: '/cache/',
	/** Default plate metadata path in 3MF files */
	PLATE_GCODE_PATH: 'Metadata/plate_1.gcode',
} as const;

// ==================== Error Messages ====================
export const ERROR_TEMPLATES = {
	MQTT_CONNECTION_TIMEOUT: (timeout: number) =>
		`MQTT connection timeout after ${timeout}ms. Please check printer IP and network connection.`,
	MQTT_NOT_CONNECTED: 'MQTT client is not connected',
	FTP_CONNECTION_FAILED: (ip: string, port: number, message: string) =>
		`Failed to connect to FTP server at ${ip}:${port}: ${message}`,
	FTP_NOT_CONNECTED: 'FTP client is not connected',
	FTP_AUTH_FAILED: 'FTP authentication failed. Please verify your access code in the credentials.',
	FTP_PERMISSION_DENIED: (path: string) =>
		`Permission denied. The printer may not allow file uploads to this location: ${path}`,
	FILE_NOT_FOUND: (path: string) =>
		`File not found: ${path}. Make sure the .3mf file exists on the printer's SD card.`,
	DOWNLOAD_TIMEOUT: (path: string) =>
		`Download timeout: ${path} took too long to download. The file may be very large or the connection is slow.`,
	STATUS_TIMEOUT: (timeout: number) => `Status request timeout after ${timeout}ms`,
	COMMAND_RESPONSE_TIMEOUT: (timeout: number) => `Command response timeout after ${timeout}ms`,
	AMS_NOT_DETECTED:
		'Auto-detect enabled but AMS not detected. The printer status query did not return AMS data. ' +
		'This could be due to: (1) AMS not connected, (2) MQTT timing issue, or (3) printer not sending AMS data. ' +
		'Please disable auto-detect and use manual AMS mapping, or ensure your AMS is properly connected.',
	FILAMENT_NOT_FOUND: (type: string, color: string, index: number, available: string) =>
		`Filament not found in AMS: Need ${type} (${color}) for profile ${index}. Available: ${available}`,
	PRINTER_OFFLINE:
		'Cannot connect to printer. Is the printer online and Developer Mode enabled?',
} as const;
