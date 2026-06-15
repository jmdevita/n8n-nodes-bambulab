import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { BambuLabMqttClient } from './helpers/MqttHelper';
import { BambuLabFtpClient } from './helpers/FtpHelper';
import { BambuLabCommands } from './helpers/commands';
import { FilamentProfileParser } from './helpers/FilamentProfileParser';
import { FilamentMatcher } from './helpers/FilamentMatcher';
import { PathValidator } from './helpers/PathValidator';
import type {
	BambuLabCredentials,
	LEDMode,
	LEDNode,
	FilamentMatchResult,
	MatchedFilamentProfile,
} from './helpers/types';

function formatBytes(bytes?: number): string | null {
	if (bytes === undefined || bytes === null) return null;
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function timeAgo(date?: Date): string | null {
	if (!date) return null;
	const ms = Date.now() - date.getTime();
	if (ms < 0) return null;
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	return `${d}d ago`;
}

function formatFileLabel(name: string, size?: number, modifiedTime?: Date): string {
	const meta = [formatBytes(size), timeAgo(modifiedTime)].filter(Boolean);
	return meta.length ? `${name} — ${meta.join(', ')}` : name;
}

export class BambuLab implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Bambu Lab',
		name: 'bambuLab',
		icon: 'file:bambulab.png',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Interact with Bambu Lab 3D Printers via MQTT and FTP',
		defaults: {
			name: 'Bambu Lab',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'bambuLabApi',
				required: true,
				testedBy: 'bambuLabApiTest',
			},
		],
		properties: [
			// ==================== Resource Selection ====================
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Print',
						value: 'print',
						description: 'Control print jobs',
					},
					{
						name: 'Status',
						value: 'status',
						description: 'Get printer status and information',
					},
					{
						name: 'File',
						value: 'file',
						description: 'Manage files on the printer',
					},
					{
						name: 'Camera',
						value: 'camera',
						description: 'Access printer camera',
					},
					{
						name: 'Control',
						value: 'control',
						description: 'Control printer settings and hardware',
					},
				],
				default: 'print',
			},

			// ==================== PRINT OPERATIONS ====================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['print'],
					},
				},
				options: [
					{
						name: 'Start',
						value: 'start',
						action: 'Start a print job',
						description: 'Start printing a file from the SD card',
					},
					{
						name: 'Pause',
						value: 'pause',
						action: 'Pause current print',
						description: 'Pause the currently running print job',
					},
					{
						name: 'Resume',
						value: 'resume',
						action: 'Resume paused print',
						description: 'Resume a paused print job',
					},
					{
						name: 'Stop',
						value: 'stop',
						action: 'Stop current print',
						description: 'Stop the currently running print job',
					},
				],
				default: 'start',
			},

			// Print: Start - File (resourceLocator)
			{
				displayName: 'File',
				name: 'fileName',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: {
					show: {
						resource: ['print'],
						operation: ['start'],
					},
				},
				description:
					'The .3mf file on the printer to print. Must be a sliced project file exported from Bambu Studio.',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a file…',
						typeOptions: {
							searchListMethod: 'searchFiles',
							searchable: true,
						},
					},
					{
						displayName: 'By Path',
						name: 'path',
						type: 'string',
						placeholder: '/sdcard/model.3mf',
						hint: 'Full path or filename. Supports expressions like {{$json.fileName}}.',
					},
				],
			},

			// Print: Start - Bed Type (promoted to top-level for visibility)
			{
				displayName: 'Bed Type',
				name: 'bedType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['print'],
						operation: ['start'],
					},
				},
				default: 'auto',
				description:
					'Type of build plate installed. Use "Auto" to let the printer detect (recommended for X1 series); choose a specific plate if auto-detection fails to match.',
				options: [
					{ name: 'Auto', value: 'auto' },
					{ name: 'Cool Plate', value: 'cool_plate' },
					{ name: 'Engineering Plate', value: 'eng_plate' },
					{ name: 'High Temp Plate', value: 'hot_plate' },
					{ name: 'Textured PEI Plate', value: 'textured_plate' },
				],
			},

			// Print: Start - Options
			{
				displayName: 'Additional Options',
				name: 'printOptions',
				type: 'collection',
				placeholder: 'Add Option',
				displayOptions: {
					show: {
						resource: ['print'],
						operation: ['start'],
					},
				},
				default: {},
				options: [
					{
						displayName: '(Beta) Auto-Detect Filament Profiles',
						name: 'autoDetectFilaments',
						type: 'boolean',
						default: false,
						description:
							'Automatically detect filament profiles and AMS mapping from the .3mf file on the printer. The file will be downloaded via FTP and parsed. If detection fails, the print operation will fail with an error. When enabled, Use AMS and AMS Mapping options are ignored.',
					},
					{
						displayName: 'Bed Leveling',
						name: 'bedLeveling',
						type: 'boolean',
						default: true,
						description: 'Whether to perform bed leveling before printing',
					},
					{
						displayName: 'Flow Calibration',
						name: 'flowCalibration',
						type: 'boolean',
						default: false,
						description: 'Whether to perform flow calibration before printing',
					},
					{
						displayName: 'Vibration Calibration',
						name: 'vibrationCalibration',
						type: 'boolean',
						default: true,
						description: 'Whether to perform vibration calibration before printing',
					},
					{
						displayName: 'Layer Inspect',
						name: 'layerInspect',
						type: 'boolean',
						default: false,
						description: 'Whether to enable layer inspection during printing',
					},
					{
						displayName: 'Timelapse',
						name: 'timelapse',
						type: 'boolean',
						default: false,
						description: 'Whether to record a timelapse video of the print',
					},
					{
						displayName: 'Use AMS',
						name: 'useAMS',
						type: 'boolean',
						default: true,
						description:
							'Whether to use the Automatic Material System (AMS) for filament. If disabled, the printer will use the external spool holder (tray 0).',
						displayOptions: {
							show: {
								autoDetectFilaments: [false],
							},
						},
					},
					{
						displayName: 'AMS Mapping',
						name: 'amsMapping',
						type: 'string',
						default: '',
						description:
							'Comma-separated tray IDs mapping to filament profiles in the .3mf file. Each position corresponds to a profile from the slicer in order. Use -1 for unused profiles. Example: "0" for single filament in slot 1, or "2,-1,0" for 3 profiles where first uses slot 3, second is unused, third uses slot 1. Leave blank to use the mapping embedded in the .3mf file by the slicer (recommended). For A1 series: 0-3 = AMS slots 1-4.',
						displayOptions: {
							show: {
								autoDetectFilaments: [false],
								useAMS: [true],
							},
						},
					},
				],
			},

			// ==================== STATUS OPERATIONS ====================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['status'],
					},
				},
				options: [
					{
						name: 'Get Current Status',
						value: 'getCurrent',
						action: 'Get current printer status',
						description: 'Retrieve the current status of the printer',
					},
					{
						name: 'Get Print Progress',
						value: 'getProgress',
						action: 'Get print progress',
						description: 'Get progress information for the current print job',
					},
					{
						name: 'Get Temperature',
						value: 'getTemperature',
						action: 'Get temperature readings',
						description: 'Get current temperature readings from the printer',
					},
				],
				default: 'getCurrent',
			},

			// ==================== FILE OPERATIONS ====================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['file'],
					},
				},
				options: [
					{
						name: 'Upload',
						value: 'upload',
						action: 'Upload a file',
						description: 'Upload a file to the printer via FTP',
					},
					{
						name: 'List',
						value: 'list',
						action: 'List files',
						description: 'List files on the printer SD card',
					},
					{
						name: 'Download',
						value: 'download',
						action: 'Download a file',
						description: 'Download a file from the printer as binary data',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a file',
						description: 'Delete a file from the printer SD card',
					},
				],
				default: 'upload',
			},

			// File: Upload - Binary Property
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['upload'],
					},
				},
				default: 'data',
				required: true,
				placeholder: 'data',
				description:
					'Name of the binary property on the incoming item containing the file to upload. Use an HTTP Request, Read Binary File, or webhook node upstream to load the .3mf / .gcode file.',
				hint: 'Defaults to "data" — the property name n8n uses for the first binary item.',
			},

			// File: Upload - File Name
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['upload'],
					},
				},
				default: '',
				required: true,
				placeholder: 'model.gcode',
				description: 'Name for the uploaded file',
			},

			// File: Upload - Remote Path
			{
				displayName: 'Remote Path',
				name: 'remotePath',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['upload'],
					},
				},
				default: '/',
				description: 'Remote path on the printer (default: root directory)',
			},

			// File: List - Path
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['list'],
					},
				},
				default: '/',
				description: 'Path to list files from (default: root directory)',
			},

			// File: Delete / Download - File (resourceLocator)
			{
				displayName: 'File',
				name: 'filePath',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['delete', 'download'],
					},
				},
				description: 'File on the printer to operate on',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a file…',
						typeOptions: {
							searchListMethod: 'searchFiles',
							searchable: true,
						},
					},
					{
						displayName: 'By Path',
						name: 'path',
						type: 'string',
						placeholder: '/sdcard/model.3mf',
						hint: 'Full path on the printer. Supports expressions.',
					},
				],
			},

			// ==================== CAMERA OPERATIONS ====================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['camera'],
					},
				},
				options: [
					{
						name: 'Get Stream URL',
						value: 'getStreamUrl',
						action: 'Get camera stream URL',
						description: 'Get the URL for the camera stream',
					},
					{
						name: 'Get Snapshot',
						value: 'getSnapshot',
						action: 'Get camera snapshot',
						description: 'Get a snapshot from the printer camera',
					},
				],
				default: 'getStreamUrl',
			},

			// ==================== CONTROL OPERATIONS ====================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['control'],
					},
				},
				options: [
					{
						name: 'Set LED',
						value: 'setLED',
						action: 'Control LED lights',
						description: 'Control printer LED lights',
					},
					{
						name: 'Set Speed',
						value: 'setSpeed',
						action: 'Set print speed',
						description: 'Set the print speed percentage',
					},
					{
						name: 'Home Axes',
						value: 'home',
						action: 'Home printer axes',
						description: 'Home all printer axes',
					},
				],
				default: 'setLED',
			},

			// Control: LED - Node
			{
				displayName: 'LED',
				name: 'ledNode',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['control'],
						operation: ['setLED'],
					},
				},
				options: [
					{
						name: 'Chamber Light',
						value: 'chamber_light',
					},
					{
						name: 'Work Light',
						value: 'work_light',
					},
					{
						name: 'Logo LED',
						value: 'logo_led',
					},
				],
				default: 'chamber_light',
				description: 'Which LED to control',
			},

			// Control: LED - Mode
			{
				displayName: 'Mode',
				name: 'ledMode',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['control'],
						operation: ['setLED'],
					},
				},
				options: [
					{
						name: 'On',
						value: 'on',
					},
					{
						name: 'Off',
						value: 'off',
					},
					{
						name: 'Flashing',
						value: 'flashing',
					},
				],
				default: 'on',
				description: 'LED mode',
			},

			// Control: Speed - Percentage
			{
				displayName: 'Speed Percentage',
				name: 'speedPercentage',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['control'],
						operation: ['setSpeed'],
					},
				},
				default: 100,
				typeOptions: {
					minValue: 50,
					maxValue: 166,
				},
				description: 'Print speed percentage (50-166)',
			},
		],
	};

	methods = {
		listSearch: {
			async searchFiles(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				const credentials = (await this.getCredentials(
					'bambuLabApi',
				)) as unknown as BambuLabCredentials;
				const ftpClient = new BambuLabFtpClient(credentials);

				try {
					await ftpClient.connect();
					const files = await ftpClient.listPrintableFiles();

					const lowered = filter?.toLowerCase();
					const matched = lowered
						? files.filter((f) => {
								const base = f.name.split('/').pop() ?? f.name;
								return base.toLowerCase().includes(lowered);
							})
						: files;

					return {
						results: matched.map((f) => {
							const base = f.name.split('/').pop() ?? f.name;
							return {
								name: formatFileLabel(base, f.size, f.modifiedTime),
								value: f.name,
							};
						}),
					};
				} catch (err) {
					throw new Error(
						`Cannot list files on printer at ${credentials.printerIp}: ${
							(err as Error).message
						}. Switch to "By Path" mode to enter the filename manually.`,
					);
				} finally {
					ftpClient.disconnect();
				}
			},
		},
		credentialTest: {
			async bambuLabApiTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const credentials = credential.data as unknown as BambuLabCredentials;

				try {
					// Test MQTT and FTP connections in parallel for faster validation
					const mqttClient = new BambuLabMqttClient(credentials);
					const ftpClient = new BambuLabFtpClient(credentials);

					await Promise.all([
						mqttClient.connect().then(() => mqttClient.disconnect()),
						ftpClient.connect().then(() => ftpClient.disconnect()),
					]);

					return {
						status: 'OK',
						message: 'MQTT and FTP connections successful',
					};
				} catch (error) {
					const err = error as Error;
					// Provide more specific error message
					if (err.message.includes('MQTT') || err.message.includes('mqtt')) {
						return {
							status: 'Error',
							message: `MQTT connection failed: ${err.message}`,
						};
					} else if (err.message.includes('FTP') || err.message.includes('ftp')) {
						return {
							status: 'Error',
							message: `FTP connection failed: ${err.message}`,
						};
					}
					return {
						status: 'Error',
						message: `Connection failed: ${err.message}`,
					};
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Get credentials
		const credentials = (await this.getCredentials(
			'bambuLabApi',
		)) as unknown as BambuLabCredentials;

		// Initialize helpers
		const mqttClient = new BambuLabMqttClient(credentials);
		const ftpClient = new BambuLabFtpClient(credentials);
		const commands = new BambuLabCommands();

		try {
			// Track if MQTT connection has been established
			let mqttConnected = false;

			for (let i = 0; i < items.length; i++) {
				try {
					const resource = this.getNodeParameter('resource', i) as string;
					const operation = this.getNodeParameter('operation', i) as string;

					let responseData: IDataObject = {};

					// Connect to MQTT once if needed for MQTT-based resources
					if (
						(resource === 'print' || resource === 'status' || resource === 'control') &&
						!mqttConnected
					) {
						await mqttClient.connect();
						mqttConnected = true;
					}

					// ==================== PRINT RESOURCE ====================
					if (resource === 'print') {
						if (operation === 'start') {
							const fileName = this.getNodeParameter('fileName', i, '', {
								extractValue: true,
							}) as string;
							const options = this.getNodeParameter('printOptions', i, {}) as IDataObject;
							const autoDetect = (options.autoDetectFilaments as boolean) ?? false;

							let amsMapping: number[] | undefined;
							let useAMS = (options.useAMS as boolean) ?? true;
							let matchResult: FilamentMatchResult | undefined; // Store matching details for response

							if (autoDetect) {
								// ==================== AUTO-DETECT MODE ====================
								// Use a dedicated FTP client for the download; ensure it's always closed
								// even if download/parsing throws, to avoid leaking the printer's
								// limited FTP connection slots.
								const detectFtpClient = new BambuLabFtpClient(credentials);
								try {
									let fileBuffer: Buffer;
									try {
										await detectFtpClient.connect();

										// FTP path: Files are in root directory (/), not /sdcard/
										// MQTT uses file:///sdcard/ but FTP exposes files at root
										// Sanitize fileName to prevent path traversal attacks
										const sanitizedFileName = PathValidator.sanitizePath(fileName);
										const remotePath = sanitizedFileName.startsWith('/')
											? sanitizedFileName
											: `/${sanitizedFileName}`;

										fileBuffer = await detectFtpClient.downloadFileAsBuffer(remotePath);
									} finally {
										detectFtpClient.disconnect();
									}

									// Step 2: Parse filament profiles from .3mf
									const parsedData = FilamentProfileParser.parseFromBuffer(fileBuffer);

									// Step 3: Query current printer/AMS status
									const currentStatus = await mqttClient.getStatus();

									// Step 4: Match profiles to current AMS configuration
									matchResult = FilamentMatcher.matchProfilesToAMS(
										parsedData.profiles,
										currentStatus,
									);

									// Auto-detect mode requires AMS to be detected
									// If user enabled auto-detect but no AMS found, fail immediately
									if (!matchResult.amsDetected) {
										throw new Error(
											'Auto-detect enabled but AMS not detected. The printer status query did not return AMS data. ' +
												'This could be due to: (1) AMS not connected, (2) MQTT timing issue, or (3) printer not sending AMS data. ' +
												'Please disable auto-detect and use manual AMS mapping, or ensure your AMS is properly connected.',
										);
									}

									// Use matched mapping (accounts for current slot positions)
									amsMapping = matchResult.mapping;
									useAMS = matchResult.amsDetected; // Use AMS only if detected
								} catch (error) {
									// FAIL OPERATION - per user's choice
									throw new NodeOperationError(
										this.getNode(),
										`Failed to auto-detect filament profiles from ${fileName}: ${
											error instanceof Error ? error.message : String(error)
										}. Please disable auto-detect and use manual AMS mapping, or ensure the .3mf file is valid and accessible on the printer.`,
										{ itemIndex: i },
									);
								}
							} else {
								// ==================== MANUAL MODE ====================
								useAMS = (options.useAMS as boolean) ?? true;

								// Parse AMS mapping string to number array
								if (options.amsMapping && typeof options.amsMapping === 'string') {
									try {
										amsMapping = options.amsMapping
											.split(',')
											.map((s: string) => s.trim())
											.filter((s: string) => s !== '')
											.map((s: string) => {
												const num = parseInt(s, 10);
												if (isNaN(num)) {
													throw new Error(
														`Invalid AMS mapping value: "${s}". Must be a number or -1.`,
													);
												}
												return num;
											});
									} catch (error) {
										throw new Error(
											`Failed to parse AMS mapping: ${error instanceof Error ? error.message : String(error)}`,
										);
									}
								}
							}

							// Build and send command
							const bedType = this.getNodeParameter('bedType', i, 'auto') as string;
							const command = commands.startPrint(fileName, {
								bedLeveling: options.bedLeveling as boolean | undefined,
								bedType,
								flowCalibration: options.flowCalibration as boolean | undefined,
								vibrationCalibration: options.vibrationCalibration as boolean | undefined,
								layerInspect: options.layerInspect as boolean | undefined,
								timelapse: options.timelapse as boolean | undefined,
								useAMS,
								amsMapping,
							});

							await mqttClient.publishCommand(command);

							// Include detection info in response if auto-detect was used
							responseData = {
								success: true,
								message: `Print job started: ${fileName}`,
								fileName,
								...(autoDetect && matchResult
									? {
											autoDetected: true,
											filamentsDetected: matchResult.matches.length,
											amsMapping: amsMapping,
											amsDetected: matchResult.amsDetected,
											totalSlots: matchResult.totalSlots,
											filamentMatches: matchResult.matches.map((m: MatchedFilamentProfile) => ({
												type: m.type,
												color: m.colour,
												matchedSlot: m.matchedSlot,
												matchQuality: m.matchQuality,
												currentType: m.currentType,
												currentColor: m.currentColor,
											})),
										}
									: {}),
							};
						} else if (operation === 'pause') {
							const command = commands.pausePrint();
							await mqttClient.publishCommand(command);
							responseData = { success: true, message: 'Print paused' };
						} else if (operation === 'resume') {
							const command = commands.resumePrint();
							await mqttClient.publishCommand(command);
							responseData = { success: true, message: 'Print resumed' };
						} else if (operation === 'stop') {
							const command = commands.stopPrint();
							await mqttClient.publishCommand(command);
							responseData = { success: true, message: 'Print stopped' };
						} else {
							throw new NodeOperationError(
								this.getNode(),
								`Unknown operation "${operation}" for resource "print"`,
								{ itemIndex: i },
							);
						}
					}

					// ==================== STATUS RESOURCE ====================
					else if (resource === 'status') {
						if (operation === 'getCurrent') {
							const status = await mqttClient.getStatus();
							responseData = status as unknown as IDataObject;
						} else if (operation === 'getProgress') {
							const status = await mqttClient.getStatus();
							responseData = {
								progress: status.mc_percent || 0,
								layer: status.layer_num || 0,
								totalLayers: status.total_layer_num || 0,
								remainingTime: status.mc_remaining_time || 0,
								fileName: status.gcode_file || '',
								state: status.gcode_state || 'UNKNOWN',
							};
						} else if (operation === 'getTemperature') {
							const status = await mqttClient.getStatus();
							responseData = {
								nozzle: {
									current: status.nozzle_temper || 0,
									target: status.nozzle_target_temper || 0,
								},
								bed: {
									current: status.bed_temper || 0,
									target: status.bed_target_temper || 0,
								},
								chamber: status.chamber_temper || 0,
							};
						} else {
							throw new NodeOperationError(
								this.getNode(),
								`Unknown operation "${operation}" for resource "status"`,
								{ itemIndex: i },
							);
						}
					}

					// ==================== FILE RESOURCE ====================
					else if (resource === 'file') {
						if (operation === 'upload') {
							const binaryPropertyName = this.getNodeParameter(
								'binaryPropertyName',
								i,
								'data',
							) as string;
							const fileName = this.getNodeParameter('fileName', i) as string;
							const remotePath = this.getNodeParameter('remotePath', i, '/') as string;

							const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

							const result = await ftpClient.uploadFile({
								fileContent: buffer,
								fileName,
								remotePath,
							});

							responseData = result as unknown as IDataObject;
						} else if (operation === 'list') {
							const path = this.getNodeParameter('path', i, '/') as string;
							const result = await ftpClient.listFiles(path);
							responseData = result as unknown as IDataObject;
						} else if (operation === 'delete') {
							const filePath = this.getNodeParameter('filePath', i, '', {
								extractValue: true,
							}) as string;
							const result = await ftpClient.deleteFile(filePath);
							responseData = result as unknown as IDataObject;
						} else if (operation === 'download') {
							const filePath = this.getNodeParameter('filePath', i, '', {
								extractValue: true,
							}) as string;
							// Normalize to an absolute path so basic-ftp's get/list semantics
							// agree with the printer's FTP root.
							const sanitized = PathValidator.sanitizePath(filePath);
							const remotePath = sanitized.startsWith('/') ? sanitized : `/${sanitized}`;

							const buffer = await ftpClient.downloadFileAsBuffer(remotePath);
							const baseName = remotePath.split('/').pop() || 'download.bin';
							const binaryData = await this.helpers.prepareBinaryData(
								buffer,
								baseName,
								'application/octet-stream',
							);

							returnData.push({
								json: {
									success: true,
									fileName: baseName,
									remotePath,
									size: buffer.length,
								},
								binary: { data: binaryData },
								pairedItem: { item: i },
							});
							continue;
						} else {
							throw new NodeOperationError(
								this.getNode(),
								`Unknown operation "${operation}" for resource "file"`,
								{ itemIndex: i },
							);
						}
					}

					// ==================== CAMERA RESOURCE ====================
					else if (resource === 'camera') {
						if (operation === 'getStreamUrl') {
							responseData = {
								rtsp: `rtsp://bblp:${encodeURIComponent(credentials.accessCode)}@${credentials.printerIp}/streaming/live/1`,
								http: `http://${credentials.printerIp}:6000/stream`,
							};
						} else if (operation === 'getSnapshot') {
							responseData = {
								url: `http://${credentials.printerIp}:6000/snapshot`,
								message: 'Use this URL to fetch a snapshot image',
							};
						} else {
							throw new NodeOperationError(
								this.getNode(),
								`Unknown operation "${operation}" for resource "camera"`,
								{ itemIndex: i },
							);
						}
					}

					// ==================== CONTROL RESOURCE ====================
					else if (resource === 'control') {
						if (operation === 'setLED') {
							const ledNode = this.getNodeParameter('ledNode', i) as LEDNode;
							const ledMode = this.getNodeParameter('ledMode', i) as LEDMode;

							const command = commands.setLED(ledNode, ledMode);
							await mqttClient.publishCommand(command);
							responseData = { success: true, message: `LED ${ledNode} set to ${ledMode}` };
						} else if (operation === 'setSpeed') {
							const speedPercentage = this.getNodeParameter('speedPercentage', i) as number;

							const command = commands.setSpeed(speedPercentage);
							await mqttClient.publishCommand(command);
							responseData = { success: true, message: `Speed set to ${speedPercentage}%` };
						} else if (operation === 'home') {
							const command = commands.homeAxes();
							await mqttClient.publishCommand(command);
							responseData = { success: true, message: 'Homing axes' };
						} else {
							throw new NodeOperationError(
								this.getNode(),
								`Unknown operation "${operation}" for resource "control"`,
								{ itemIndex: i },
							);
						}
					}

					// Unknown resource
					else {
						throw new NodeOperationError(this.getNode(), `Unknown resource "${resource}"`, {
							itemIndex: i,
						});
					}

					returnData.push({
						json: responseData,
						pairedItem: { item: i },
					});
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: (error as Error).message,
							},
							pairedItem: { item: i },
						});
						continue;
					}
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				}
			}

			return [returnData];
		} finally {
			// Clean up connections - graceful disconnect with timeout fallback
			await mqttClient.disconnect();
			ftpClient.disconnect();
		}
	}
}
