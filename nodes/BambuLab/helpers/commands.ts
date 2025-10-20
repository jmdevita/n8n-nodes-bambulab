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
	private sequenceId = 0;

	/**
	 * Get next sequence ID (incremental)
	 */
	private getNextSequenceId(): string {
		return (this.sequenceId++).toString();
	}

	/**
	 * Start a print job
	 * @param fileName Name of the file on the printer's SD card
	 * @param options Print job options (amsMapping should be number[] if provided)
	 */
	startPrint(fileName: string, options?: PrintCommandOptions): PrintCommand {
		// Ensure filename has proper path format for A1 series
		// A1 uses /sdcard/, X1/P1 typically use root or /cache/
		const fileUrl = fileName.startsWith('file:///')
			? fileName
			: `file:///sdcard/${fileName}`;

		// Extract just the filename (not the full path) for display
		const displayName = fileName.split('/').pop() || fileName;

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
				bed_type: 'auto', // "auto" for local prints, or specific plate type
				bed_leveling: options?.bedLeveling ?? true,
				flow_cali: options?.flowCalibration ?? false,
				vibration_cali: options?.vibrationCalibration ?? true,
				layer_inspect: options?.layerInspect ?? false,
				timelapse: options?.timelapse ?? false,
				use_ams: options?.useAMS ?? true,
				// Default to [0] (slot 1 for AMS, or external spool tray 0)
				// Works for both use_ams true and false
				ams_mapping: options?.amsMapping ?? [0]
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
	 * Start continuous status updates
	 */
	startPushing(): PushingCommand {
		return {
			pushing: {
				sequence_id: this.getNextSequenceId(),
				command: 'start',
			},
		};
	}

	/**
	 * Stop continuous status updates
	 */
	stopPushing(): PushingCommand {
		return {
			pushing: {
				sequence_id: this.getNextSequenceId(),
				command: 'stop',
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
	 * Control chamber fan
	 * @param speed Fan speed percentage (0-100)
	 */
	setChamberFan(speed: number): GcodeLineCommand {
		const clampedSpeed = Math.max(0, Math.min(100, speed));
		return this.sendGcode('M106', `P2 S${Math.round((clampedSpeed / 100) * 255)}`);
	}

	/**
	 * Control auxiliary (part cooling) fan
	 * @param speed Fan speed percentage (0-100)
	 */
	setPartCoolingFan(speed: number): GcodeLineCommand {
		const clampedSpeed = Math.max(0, Math.min(100, speed));
		return this.sendGcode('M106', `P3 S${Math.round((clampedSpeed / 100) * 255)}`);
	}

	/**
	 * Unload filament from AMS
	 * @param trayId Tray ID (0-3)
	 */
	unloadFilament(trayId: number): GcodeLineCommand {
		return this.sendGcode('M620', `P${trayId}A`);
	}

	/**
	 * Load filament from AMS
	 * @param trayId Tray ID (0-3)
	 */
	loadFilament(trayId: number): GcodeLineCommand {
		return this.sendGcode('M620', `P${trayId}T255`);
	}

	/**
	 * Resume filament loading after manual intervention
	 */
	resumeFilamentLoad(): GcodeLineCommand {
		return this.sendGcode('M621', 'S255');
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
	 * Turn off all heaters
	 */
	turnOffHeaters(): GcodeLineCommand {
		return this.sendGcode('M104 S0; M140 S0');
	}

	/**
	 * Emergency stop (turns off all heaters and motors)
	 */
	emergencyStop(): GcodeLineCommand {
		return this.sendGcode('M112');
	}

	/**
	 * Get current sequence ID (for reference)
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
