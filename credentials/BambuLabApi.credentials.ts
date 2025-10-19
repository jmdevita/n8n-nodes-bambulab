import type {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BambuLabApi implements ICredentialType {
	name = 'bambuLabApi';

	displayName = 'Bambu Lab API';

	documentationUrl =
		'https://wiki.bambulab.com/en/knowledge-sharing/enable-developer-mode';

	properties: INodeProperties[] = [
		{
			displayName: 'Printer IP Address',
			name: 'printerIp',
			type: 'string',
			default: '',
			required: true,
			placeholder: '192.168.1.100',
			description: 'The IP address of your Bambu Lab printer on your local network',
		},
		{
			displayName: 'Access Code',
			name: 'accessCode',
			type: 'string',
			default: '',
			required: true,
			placeholder: '12345678',
			description:
				'LAN access code from printer settings (Settings > Network > LAN Access Code)',
		},
		{
			displayName: 'Serial Number',
			name: 'serialNumber',
			type: 'string',
			default: '',
			required: true,
			placeholder: '01S00A123456789',
			description:
				'Printer serial number (found in Settings > Device > Serial Number). Required for MQTT communication.',
		},
		{
			displayName: 'MQTT Port',
			name: 'mqttPort',
			type: 'number',
			default: 8883,
			description: 'MQTT port on the printer (default: 8883 for secure connection)',
		},
		{
			displayName: 'Use TLS',
			name: 'useTls',
			type: 'boolean',
			default: true,
			description:
				'Whether to use TLS/SSL for MQTT connection (recommended). Note: Bambu Lab printers use self-signed certificates.',
		},
		{
			displayName: 'FTP Port',
			name: 'ftpPort',
			type: 'number',
			default: 990,
			description: 'FTP port on the printer for file operations (default: 990 for FTPS)',
		},
	];
}
