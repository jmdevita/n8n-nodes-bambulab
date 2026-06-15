import type {
	PrintCommand,
	PushingCommand,
	SystemCommand,
	GcodeLineCommand,
	PrintCommandOptions,
	LEDMode,
	LEDNode,
} from './types';

/**
 * Command Builder for Bambu Lab Printer MQTT Commands
 * Generates properly formatted commands with sequence IDs
 */
export class BambuLabCommands {
	// Instance-scoped counter combined with a per-instance prefix so concurrent
	// executions don't collide on sequence_id "0" / "1" / etc.
	private sequenceId = 0;
	private readonly idPrefix: string;

	constructor() {
		// Random 4-hex prefix is sufficient to disambiguate concurrent n8n
		// executions without depending on Date.now() (which can collide too).
		this.idPrefix = Math.floor(Math.random() * 0xffff)
			.toString(16)
			.padStart(4, '0');
	}

	/**
	 * Get next sequence ID (incremental, prefixed per-instance)
	 */
	private getNextSequenceId(): string {
		return `${this.idPrefix}-${this.sequenceId++}`;
	}

	/**
	 * Start a print job
	 * @param fileName Name of the file on the printer's SD card
	 * @param options Print job options (amsMapping should be number[] if provided)
	 */
	startPrint(fileName: string, options?: PrintCommandOptions): PrintCommand {
		// Build the file URL. The locator may pass a full path (e.g.
		// /sdcard/model.3mf) selected from the printer's listing, or a bare
		// filename from legacy "By Path" entry. Mirror absolute paths verbatim
		// (covers /sdcard, /cache, root layouts) and only assume /sdcard/ for
		// bare filenames.
		let fileUrl: string;
		if (fileName.startsWith('file:///')) {
			fileUrl = fileName;
		} else if (fileName.startsWith('/')) {
			fileUrl = `file://${fileName}`;
		} else {
			fileUrl = `file:///sdcard/${fileName}`;
		}

		// Extract just the filename (not the full path) for display
		const displayName = fileName.split('/').pop() || fileName;

		const useAMS = options?.useAMS ?? true;

		// Default ams_mapping depends on AMS usage:
		// - With AMS enabled, send [] so the printer reads the slot mapping
		//   embedded in the .3mf by the slicer. This is the right default for
		//   multi-color prints; sending [0] forces single-slot use.
		// - With AMS disabled, send [0] to route through the external spool tray.
		const amsMapping = options?.amsMapping ?? (useAMS ? [] : [0]);

		return {
			print: {
				sequence_id: this.getNextSequenceId(),
				command: 'project_file',
				// Metadata/plate_1.gcode points to the plate within the 3MF file
				param: 'Metadata/plate_1.gcode',
				// For local prints, these are empty strings (cloud prints use big numbers)
				project_id: '',
				profile_id: '',
				task_id: '',
				subtask_id: '',
				// File location
				url: fileUrl,
				file: '', // Not needed when url is specified
				subtask_name: displayName,
				// Print settings - Note: US spelling "bed_leveling" per working examples
				bed_type: options?.bedType ?? 'auto',
				bed_leveling: options?.bedLeveling ?? true,
				flow_cali: options?.flowCalibration ?? false,
				vibration_cali: options?.vibrationCalibration ?? true,
				layer_inspect: options?.layerInspect ?? false,
				timelapse: options?.timelapse ?? false,
				use_ams: useAMS,
				ams_mapping: amsMapping,
			},
		};
	}

	/**
	 * Pause the current print job
	 */
	pausePrint(): PrintCommand {
		return {
			print: {
				sequence_id: this.getNextSequenceId(),
				command: 'pause',
			},
		};
	}

	/**
	 * Resume a paused print job
	 */
	resumePrint(): PrintCommand {
		return {
			print: {
				sequence_id: this.getNextSequenceId(),
				command: 'resume',
			},
		};
	}

	/**
	 * Stop the current print job
	 */
	stopPrint(): PrintCommand {
		return {
			print: {
				sequence_id: this.getNextSequenceId(),
				command: 'stop',
			},
		};
	}

	/**
	 * Request full printer status (pushall)
	 */
	getPushAll(): PushingCommand {
		return {
			pushing: {
				sequence_id: this.getNextSequenceId(),
				command: 'pushall',
				push_target: 1,
			},
		};
	}

	/**
	 * Control printer LED lights
	 * @param node Which LED to control
	 * @param mode LED mode (on, off, flashing)
	 * @param onTime Time LED is on (for flashing mode, in ms)
	 * @param offTime Time LED is off (for flashing mode, in ms)
	 */
	setLED(node: LEDNode, mode: LEDMode, onTime = 500, offTime = 500): SystemCommand {
		return {
			system: {
				sequence_id: this.getNextSequenceId(),
				command: 'ledctrl',
				led_node: node,
				led_mode: mode,
				led_on_time: onTime,
				led_off_time: offTime,
			},
		};
	}

	/**
	 * Send custom G-code command to the printer
	 * @param gcode G-code command (without line number)
	 * @param param Optional parameter
	 */
	sendGcode(gcode: string, param?: string): GcodeLineCommand {
		return {
			gcode_line: {
				sequence_id: this.getNextSequenceId(),
				command: gcode,
				param: param || '',
			},
		};
	}

	/**
	 * Home the printer axes
	 */
	homeAxes(): GcodeLineCommand {
		return this.sendGcode('G28');
	}

	/**
	 * Set print speed
	 * @param speed Speed percentage (50-166)
	 */
	setSpeed(speed: number): SystemCommand {
		const clampedSpeed = Math.max(50, Math.min(166, speed));
		return {
			system: {
				sequence_id: this.getNextSequenceId(),
				command: 'print_speed',
				param: clampedSpeed.toString(),
			},
		};
	}

	/**
	 * Set bed temperature
	 * @param temperature Target temperature in Celsius
	 */
	setBedTemperature(temperature: number): GcodeLineCommand {
		return this.sendGcode('M140', `S${temperature}`);
	}

	/**
	 * Set nozzle temperature
	 * @param temperature Target temperature in Celsius
	 */
	setNozzleTemperature(temperature: number): GcodeLineCommand {
		return this.sendGcode('M104', `S${temperature}`);
	}

	/**
	 * Emergency stop (turns off all heaters and motors)
	 */
	emergencyStop(): GcodeLineCommand {
		return this.sendGcode('M112');
	}

	/**
	 * Get current sequence ID counter value (for reference)
	 */
	getCurrentSequenceId(): number {
		return this.sequenceId;
	}

	/**
	 * Reset sequence ID counter
	 */
	resetSequenceId(): void {
		this.sequenceId = 0;
	}
}
