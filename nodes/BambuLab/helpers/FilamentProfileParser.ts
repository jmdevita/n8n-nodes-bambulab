import AdmZip from 'adm-zip';
import type { FilamentProfile, ParsedFilamentData } from './types';

/**
 * Parser for extracting filament profile information from Bambu Lab .3mf files
 *
 * .3mf files are ZIP archives containing gcode and metadata.
 * The gcode header contains filament profile information that we can parse
 * to automatically detect which AMS slots are needed for a print.
 */
export class FilamentProfileParser {
	/**
	 * Parse .3mf file buffer and extract filament usage information
	 *
	 * @param buffer Buffer containing .3mf file data
	 * @returns Parsed filament data with profiles and mapping
	 * @throws Error if file is invalid or required data is missing
	 *
	 * @example
	 * const fileBuffer = await ftpClient.downloadFileAsBuffer('/model.3mf');
	 * const data = FilamentProfileParser.parseFromBuffer(fileBuffer);
	 * console.log(data.detectedMapping); // [0, 1] for 2-color print
	 */
	static parseFromBuffer(buffer: Buffer): ParsedFilamentData {
		let zip: AdmZip;

		// Step 1: Unzip the .3mf file
		try {
			zip = new AdmZip(buffer);
		} catch (error) {
			throw new Error(
				`Failed to read .3mf file: Not a valid ZIP archive. ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}

		// Step 2: Extract Metadata/plate_1.gcode
		const gcodeEntry = zip.getEntry('Metadata/plate_1.gcode');
		if (!gcodeEntry) {
			throw new Error(
				'Failed to parse .3mf file: Metadata/plate_1.gcode not found. This file may not be a sliced .3mf file, or may be corrupted.',
			);
		}

		const gcodeContent = gcodeEntry.getData().toString('utf8');

		// Step 3: Parse gcode header
		return this.parseGcodeHeader(gcodeContent);
	}

	/**
	 * Parse gcode header comments to extract filament profile information
	 *
	 * Bambu Studio embeds filament info in gcode comments like:
	 * ; filament: 1,2
	 * ; filament_type = PETG;PETG;PLA;PLA;TPU
	 * ; filament_colour = #515151;#000000;#68724D;#042F56;#2850E0
	 * ; filament_settings_id = "Name1";"Name2";"Name3";"Name4";"Name5"
	 */
	private static parseGcodeHeader(gcodeContent: string): ParsedFilamentData {
		// Read only first 500 lines (header section)
		const lines = gcodeContent.split('\n').slice(0, 500);

		let slotsUsed: number[] = [];
		let filamentTypes: string[] = [];
		let filamentColours: string[] = [];
		let filamentNames: string[] = [];

		// Parse comment lines
		for (const line of lines) {
			if (!line.startsWith(';')) continue;

			const comment = line.substring(1).trim();

			// Parse "; filament: 1,2" or "; filament: 2"
			if (comment.startsWith('filament:')) {
				const value = comment.substring('filament:'.length).trim();
				slotsUsed = this.parseSlotUsage(value);
			}

			// Parse "; filament_type = PETG;PETG;PLA;PLA;TPU"
			else if (comment.startsWith('filament_type =')) {
				const value = comment.substring('filament_type ='.length).trim();
				filamentTypes = value.split(';').map((s) => s.trim());
			}

			// Parse "; filament_colour = #515151;#000000;..."
			else if (comment.startsWith('filament_colour =')) {
				const value = comment.substring('filament_colour ='.length).trim();
				filamentColours = value.split(';').map((s) => s.trim());
			}

			// Parse "; filament_settings_id = "Name1";"Name2";..."
			else if (comment.startsWith('filament_settings_id =')) {
				const value = comment.substring('filament_settings_id ='.length).trim();
				// Split by semicolon and remove quotes
				filamentNames = value.split(';').map((s) => s.trim().replace(/^"|"$/g, ''));
			}
		}

		// Validation
		if (slotsUsed.length === 0) {
			throw new Error(
				'Failed to parse gcode: "; filament:" line not found in header. This may not be a valid Bambu Studio sliced file.',
			);
		}

		if (filamentTypes.length === 0) {
			throw new Error(
				'Failed to parse gcode: "; filament_type =" line not found in header.',
			);
		}

		// Build profiles for USED slots only
		const profiles: FilamentProfile[] = [];
		const detectedMapping: number[] = [];

		for (const slotNumber of slotsUsed) {
			const profileIndex = slotNumber - 1; // Convert 1-indexed slot to 0-indexed profile
			const trayId = slotNumber - 1; // Tray ID is also 0-indexed

			// Ensure we have data for this profile index
			if (profileIndex >= filamentTypes.length) {
				throw new Error(
					`Invalid profile index ${profileIndex} for slot ${slotNumber}. Only ${filamentTypes.length} profiles embedded in file.`,
				);
			}

			profiles.push({
				index: profileIndex,
				type: filamentTypes[profileIndex] || 'UNKNOWN',
				colour: filamentColours[profileIndex] || '#FFFFFF',
				name: filamentNames[profileIndex] || 'Unknown Profile',
				slotNumber,
				trayId,
			});

			detectedMapping.push(trayId);
		}

		return {
			profiles,
			detectedMapping,
			totalEmbedded: filamentTypes.length,
		};
	}

	/**
	 * Parse slot usage from "; filament:" comment
	 *
	 * Examples:
	 * - "1,2" -> [1, 2]
	 * - "2" -> [2]
	 * - "1,3,4" -> [1, 3, 4]
	 */
	private static parseSlotUsage(value: string): number[] {
		const slots = value
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s !== '')
			.map((s) => {
				const num = parseInt(s, 10);
				if (isNaN(num) || num < 1 || num > 4) {
					throw new Error(
						`Invalid AMS slot number: "${s}". Must be 1-4 for A1 series.`,
					);
				}
				return num;
			});

		if (slots.length === 0) {
			throw new Error('No valid slot numbers found in "; filament:" line.');
		}

		return slots;
	}
}
