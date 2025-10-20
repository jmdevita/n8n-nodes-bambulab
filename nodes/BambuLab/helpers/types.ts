/**
 * Type definitions for Bambu Lab API
 * Based on OpenBambuAPI documentation
 */

// ===== Credential Types =====

export interface BambuLabCredentials {
	printerIp: string;
	accessCode: string;
	serialNumber: string;
	mqttPort: number;
	useTls: boolean;
	ftpPort: number;
}

// ===== Printer Status Types =====

export interface PrinterStatus {
	print?: PrintInfo;
	gcode_file?: string;
	gcode_state?: string;
	mc_percent?: number;
	mc_remaining_time?: number;
	layer_num?: number;
	total_layer_num?: number;
	nozzle_temper?: number;
	nozzle_target_temper?: number;
	bed_temper?: number;
	bed_target_temper?: number;
	chamber_temper?: number;
	fan_gear?: number;
	spd_mag?: number;
	spd_lvl?: number;
	print_error?: number;
	lifecycle?: string;
	wifi_signal?: string;
	gcode_start_time?: string;
	mc_print_stage?: string;
	hms?: HMSError[];
	online?: OnlineStatus;
	ams?: AMSStatus;
	vt_tray?: VTTray;
	ipcam?: IPCam;
	lights_report?: LightsReport[];
	upgrade_state?: UpgradeState;
	upload?: UploadStatus;
	command?: string;
	msg?: number;
	sequence_id?: string;
}

export interface PrintInfo {
	command?: string;
	param?: string;
	sequence_id?: string;
	msg?: number;
	url?: string;
	subtask_name?: string;
	gcode_file?: string;
}

export interface HMSError {
	attr?: number;
	code?: number;
}

export interface OnlineStatus {
	ahb?: boolean;
	rfid?: boolean;
	version?: number;
}

export interface AMSStatus {
	id?: number;
	humidity?: string;
	temp?: string;
	tray?: AMSTray[];
}

export interface AMSTray {
	id?: string;
	remain?: number;
	k?: number;
	tag_uid?: string;
	tray_id_name?: string;
	tray_info_idx?: string;
	tray_type?: string;
	tray_sub_brands?: string;
	tray_color?: string;
	tray_weight?: string;
	tray_diameter?: string;
	tray_temp?: string;
	tray_time?: string;
	bed_temp_type?: string;
	bed_temp?: string;
	nozzle_temp_max?: string;
	nozzle_temp_min?: string;
	xcam_info?: string;
	tray_uuid?: string;
}

export interface VTTray {
	id?: string;
	tag_uid?: string;
	tray_id_name?: string;
	tray_info_idx?: string;
	tray_type?: string;
	tray_sub_brands?: string;
	tray_color?: string;
	tray_weight?: string;
	tray_diameter?: string;
	tray_temp?: string;
	nozzle_temp_max?: string;
	nozzle_temp_min?: string;
	remain?: number;
	k?: number;
}

export interface IPCam {
	ipcam_dev?: string;
	ipcam_record?: string;
	timelapse?: string;
	mode_bits?: number;
}

export interface LightsReport {
	node?: string;
	mode?: string;
}

export interface UpgradeState {
	sequence_id?: number;
	progress?: string;
	status?: string;
	consistency_request?: boolean;
	dis_state?: number;
	err_code?: number;
	force_upgrade?: boolean;
	message?: string;
	module?: string;
	new_version_state?: number;
	new_ver_list?: unknown[];
}

export interface UploadStatus {
	status?: string;
	progress?: number;
	message?: string;
}

// ===== Command Types =====

export interface BaseCommand {
	sequence_id?: string;
}

export interface PrintCommand extends BaseCommand {
	print: {
		sequence_id: string;
		command: 'project_file' | 'pause' | 'resume' | 'stop';
		param?: string;
		// Required fields for project_file command (local prints)
		project_id?: string;
		profile_id?: string;
		task_id?: string;
		subtask_id?: string;
		// File location
		url?: string;
		file?: string;
		subtask_name?: string;
		md5?: string;
		// Print settings
		bed_type?: string;
		bed_leveling?: boolean;
		flow_cali?: boolean;
		vibration_cali?: boolean;
		layer_inspect?: boolean;
		timelapse?: boolean;
		use_ams?: boolean;
		ams_mapping?: number[];
	};
}

export interface SystemCommand extends BaseCommand {
	system?: {
		sequence_id: string;
		command: string;
		param?: string;
		led_node?: string;
		led_mode?: string;
		led_on_time?: number;
		led_off_time?: number;
	};
}

export interface PushingCommand extends BaseCommand {
	pushing: {
		sequence_id: string;
		command: 'pushall' | 'start' | 'stop';
		push_target?: number;
	};
}

export interface GcodeLineCommand extends BaseCommand {
	gcode_line: {
		sequence_id: string;
		command: string;
		param?: string;
	};
}

// ===== Temperature Types =====

export interface TemperatureData {
	nozzle_temp: number;
	nozzle_target_temp: number;
	bed_temp: number;
	bed_target_temp: number;
	chamber_temp?: number;
}

// ===== Camera Types =====

export interface CameraInfo {
	enabled: boolean;
	recording?: boolean;
	timelapse?: boolean;
	stream_url?: string;
	rtsp_url?: string;
}

// ===== FTP Types =====

export interface FTPUploadOptions {
	localPath?: string;
	remotePath: string;
	fileName: string;
	fileContent?: Buffer | string;
}

export interface FTPFileInfo {
	name: string;
	type: 'file' | 'directory';
	size: number;
	modifiedTime?: Date;
	permissions?: unknown; // Can be UnixPermissions, string, or number depending on FTP client
}

export interface FTPUploadProgress {
	fileName: string;
	bytesTransferred: number;
	totalBytes: number;
	percentage: number;
}

// ===== Print Job Types =====

export interface PrintJobOptions {
	fileName: string;
	bedLeveling?: boolean;
	flowCalibration?: boolean;
	vibrationCalibration?: boolean;
	layerInspect?: boolean;
	timelapse?: boolean;
	useAMS?: boolean;
	amsMapping?: string | number[]; // String from UI (comma-separated) or array when used programmatically
}

// Subset of PrintJobOptions used for command generation (after UI string parsing)
export interface PrintCommandOptions {
	bedLeveling?: boolean;
	flowCalibration?: boolean;
	vibrationCalibration?: boolean;
	layerInspect?: boolean;
	timelapse?: boolean;
	useAMS?: boolean;
	amsMapping?: number[]; // Only number array for command generation
}

// ===== Version Info Types =====

export interface VersionInfo {
	software_version?: string;
	hardware_version?: string;
	ota_version?: string;
}

// ===== Error Types =====

export interface BambuLabError {
	code: number;
	message: string;
	details?: Record<string, unknown>;
}

// ===== MQTT Message Types =====

export interface MQTTMessage {
	print?: PrintInfo & { sequence_id?: string };
	pushing?: { sequence_id?: string; command?: string; push_target?: number };
	system?: { sequence_id?: string; command?: string };
	gcode_line?: { sequence_id?: string; command?: string };
	info?: Record<string, unknown>;
	[key: string]: unknown;
}

// ===== Response Types =====

// Union type for all command types
export type AnyCommand = PrintCommand | SystemCommand | PushingCommand | GcodeLineCommand;

export interface CommandResponse {
	success: boolean;
	message: string;
	data?: MQTTMessage | PrinterStatus | unknown;
	sequence_id?: string;
}

export interface FileListResponse {
	success: boolean;
	files: FTPFileInfo[];
}

export interface FileUploadResponse {
	success: boolean;
	message: string;
	fileName: string;
	remotePath: string;
}

export interface FileDeleteResponse {
	success: boolean;
	message: string;
	fileName: string;
}

// ===== Print States (enum-like) =====

export type PrintState =
	| 'IDLE'
	| 'PRINTING'
	| 'PAUSED'
	| 'FINISHED'
	| 'FAILED'
	| 'PREPARE'
	| 'RUNNING'
	| 'SLICING'
	| 'UNKNOWN';

export type GcodeState =
	| 'IDLE'
	| 'PREPARE'
	| 'RUNNING'
	| 'PAUSE'
	| 'FINISH'
	| 'FAILED'
	| 'UNKNOWN';

// ===== Lifecycle States =====

export type LifecycleState = 'idle' | 'printing' | 'paused' | 'preparing' | 'unknown';

// ===== LED Mode Types =====

export type LEDMode = 'on' | 'off' | 'flashing';

export type LEDNode = 'chamber_light' | 'work_light' | 'logo_led';

// ===== Filament Profile Parsing Types =====

export interface FilamentProfile {
	index: number; // Profile position in .3mf (0, 1, 2...)
	type: string; // Filament type: "PLA", "PETG", "TPU", etc.
	colour: string; // Hex color "#515151" or color name
	name: string; // Full profile name from slicer
	slotNumber: number; // AMS slot number (1-indexed, from gcode)
	trayId: number; // AMS tray ID (0-indexed, for ams_mapping)
}

export interface ParsedFilamentData {
	profiles: FilamentProfile[]; // Only profiles actually used in print
	detectedMapping: number[]; // Generated ams_mapping array
	totalEmbedded: number; // Total profiles embedded in .3mf file
}

// ===== Filament Matching Types =====

export interface MatchedFilamentProfile extends FilamentProfile {
	matchedSlot: number; // Current physical slot where filament is loaded (1-4)
	matchedTrayId: number; // Current tray ID (0-indexed, for ams_mapping)
	matchQuality: 'exact'; // Always exact for strict matching mode
	currentColor: string; // Actual color currently in AMS slot
	currentType: string; // Actual type currently in AMS slot
}

export interface FilamentMatchResult {
	mapping: number[]; // Final ams_mapping array to use for print command
	matches: MatchedFilamentProfile[]; // Detailed match info for each profile
	amsDetected: boolean; // Whether AMS is present on printer
	totalSlots: number; // Total number of AMS slots available
}
