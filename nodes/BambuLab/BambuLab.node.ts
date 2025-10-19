import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { BambuLabMqttClient } from './helpers/MqttHelper';
import { BambuLabFtpClient } from './helpers/FtpHelper';
import { BambuLabCommands } from './helpers/commands';
import type { BambuLabCredentials } from './helpers/types';

export class BambuLab implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Bambu Lab',
		name: 'bambuLab',
		icon: 'file:bambulab.svg',
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

			// Print: Start - File Name
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['print'],
						operation: ['start'],
					},
				},
				default: '',
				required: true,
				placeholder: 'model.gcode',
				description: 'Name of the file on the printer SD card (usually in /mnt/sdcard/)',
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
						default: false,
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
						displayName: 'Use AMS',
						name: 'useAMS',
						type: 'boolean',
						default: false,
						description: 'Whether to use the Automatic Material System (AMS)',
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
						name: 'Delete',
						value: 'delete',
						action: 'Delete a file',
						description: 'Delete a file from the printer SD card',
					},
				],
				default: 'upload',
			},

			// File: Upload - File Content
			{
				displayName: 'File Content',
				name: 'fileContent',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['upload'],
					},
				},
				default: '',
				required: true,
				description: 'The content of the file to upload (G-code or 3MF)',
				typeOptions: {
					rows: 10,
				},
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

			// File: Delete - File Path
			{
				displayName: 'File Path',
				name: 'filePath',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['delete'],
					},
				},
				default: '',
				required: true,
				placeholder: '/model.gcode',
				description: 'Full path to the file to delete',
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Get credentials
		const credentials = (await this.getCredentials('bambuLabApi')) as unknown as BambuLabCredentials;

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

					let responseData: any = {};

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
							const fileName = this.getNodeParameter('fileName', i) as string;
							const options = this.getNodeParameter('printOptions', i, {}) as any;

							const command = commands.startPrint(fileName, {
								bedLeveling: options.bedLeveling,
								flowCalibration: options.flowCalibration,
								vibrationCalibration: options.vibrationCalibration,
								layerInspect: options.layerInspect,
								useAMS: options.useAMS,
							});

							await mqttClient.publishCommand(command);
							responseData = {
								success: true,
								message: `Print job started: ${fileName}`,
								fileName,
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
							responseData = status;
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
							const fileContent = this.getNodeParameter('fileContent', i) as string;
							const fileName = this.getNodeParameter('fileName', i) as string;
							const remotePath = this.getNodeParameter('remotePath', i, '/') as string;

							const result = await ftpClient.uploadFile({
								fileContent,
								fileName,
								remotePath,
							});

							responseData = result;
						} else if (operation === 'list') {
							const path = this.getNodeParameter('path', i, '/') as string;
							const result = await ftpClient.listFiles(path);
							responseData = result;
						} else if (operation === 'delete') {
							const filePath = this.getNodeParameter('filePath', i) as string;
							const result = await ftpClient.deleteFile(filePath);
							responseData = result;
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
								rtsp: `rtsp://bblp:${credentials.accessCode}@${credentials.printerIp}/streaming/live/1`,
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
							const ledNode = this.getNodeParameter('ledNode', i) as any;
							const ledMode = this.getNodeParameter('ledMode', i) as any;

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
						throw new NodeOperationError(
							this.getNode(),
							`Unknown resource "${resource}"`,
							{ itemIndex: i },
						);
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
			// Clean up connections
			mqttClient.disconnect();
			ftpClient.disconnect();
		}
	}
}
