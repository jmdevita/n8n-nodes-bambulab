import { BambuLabCommands } from '../commands';

describe('BambuLabCommands', () => {
	let commands: BambuLabCommands;

	beforeEach(() => {
		commands = new BambuLabCommands();
	});

	describe('startPrint', () => {
		it('should create a start print command with default options', () => {
			const command = commands.startPrint('model.gcode');

			expect(command.print.command).toBe('project_file');
			expect(command.print.url).toBe('file:///mnt/sdcard/model.gcode');
			expect(command.print.bed_leveling).toBe(true);
			expect(command.print.flow_cali).toBe(false);
			expect(command.print.vibration_cali).toBe(false);
			expect(command.print.layer_inspect).toBe(false);
			expect(command.print.use_ams).toBe(false);
			expect(command.print.sequence_id).toBeDefined();
		});

		it('should create a start print command with custom options', () => {
			const command = commands.startPrint('model.gcode', {
				bedLeveling: false,
				flowCalibration: true,
				vibrationCalibration: true,
				layerInspect: true,
				useAMS: true,
			});

			expect(command.print.bed_leveling).toBe(false);
			expect(command.print.flow_cali).toBe(true);
			expect(command.print.vibration_cali).toBe(true);
			expect(command.print.layer_inspect).toBe(true);
			expect(command.print.use_ams).toBe(true);
		});

		it('should handle file URLs correctly', () => {
			const command = commands.startPrint('file:///custom/path/model.gcode');
			expect(command.print.url).toBe('file:///custom/path/model.gcode');
		});
	});

	describe('pausePrint', () => {
		it('should create a pause command', () => {
			const command = commands.pausePrint();

			expect(command.print.command).toBe('pause');
			expect(command.print.sequence_id).toBeDefined();
		});
	});

	describe('resumePrint', () => {
		it('should create a resume command', () => {
			const command = commands.resumePrint();

			expect(command.print.command).toBe('resume');
			expect(command.print.sequence_id).toBeDefined();
		});
	});

	describe('stopPrint', () => {
		it('should create a stop command', () => {
			const command = commands.stopPrint();

			expect(command.print.command).toBe('stop');
			expect(command.print.sequence_id).toBeDefined();
		});
	});

	describe('getPushAll', () => {
		it('should create a pushall command', () => {
			const command = commands.getPushAll();

			expect(command.pushing.command).toBe('pushall');
			expect(command.pushing.push_target).toBe(1);
			expect(command.pushing.sequence_id).toBeDefined();
		});
	});

	describe('setLED', () => {
		it('should create an LED control command', () => {
			const command = commands.setLED('chamber_light', 'on');

			expect(command.system).toBeDefined();
			expect(command.system!.command).toBe('ledctrl');
			expect(command.system!.led_node).toBe('chamber_light');
			expect(command.system!.led_mode).toBe('on');
			expect(command.system!.sequence_id).toBeDefined();
		});

		it('should handle flashing mode with custom timing', () => {
			const command = commands.setLED('work_light', 'flashing', 1000, 500);

			expect(command.system).toBeDefined();
			expect(command.system!.led_mode).toBe('flashing');
			expect(command.system!.led_on_time).toBe(1000);
			expect(command.system!.led_off_time).toBe(500);
		});
	});

	describe('sendGcode', () => {
		it('should create a G-code command', () => {
			const command = commands.sendGcode('G28');

			expect(command.gcode_line.command).toBe('G28');
			expect(command.gcode_line.sequence_id).toBeDefined();
		});

		it('should create a G-code command with parameters', () => {
			const command = commands.sendGcode('M104', 'S200');

			expect(command.gcode_line.command).toBe('M104');
			expect(command.gcode_line.param).toBe('S200');
		});
	});

	describe('setSpeed', () => {
		it('should create a speed command with valid percentage', () => {
			const command = commands.setSpeed(100);

			expect(command.system).toBeDefined();
			expect(command.system!.command).toBe('print_speed');
			expect(command.system!.param).toBe('100');
		});

		it('should clamp speed to minimum (50)', () => {
			const command = commands.setSpeed(10);

			expect(command.system).toBeDefined();
			expect(command.system!.param).toBe('50');
		});

		it('should clamp speed to maximum (166)', () => {
			const command = commands.setSpeed(200);

			expect(command.system).toBeDefined();
			expect(command.system!.param).toBe('166');
		});
	});

	describe('setBedTemperature', () => {
		it('should create a bed temperature command', () => {
			const command = commands.setBedTemperature(60);

			expect(command.gcode_line.command).toBe('M140');
			expect(command.gcode_line.param).toBe('S60');
		});
	});

	describe('setNozzleTemperature', () => {
		it('should create a nozzle temperature command', () => {
			const command = commands.setNozzleTemperature(200);

			expect(command.gcode_line.command).toBe('M104');
			expect(command.gcode_line.param).toBe('S200');
		});
	});

	describe('homeAxes', () => {
		it('should create a home axes command', () => {
			const command = commands.homeAxes();

			expect(command.gcode_line.command).toBe('G28');
		});
	});

	describe('emergencyStop', () => {
		it('should create an emergency stop command', () => {
			const command = commands.emergencyStop();

			expect(command.gcode_line.command).toBe('M112');
		});
	});

	describe('sequence ID management', () => {
		it('should increment sequence ID for each command', () => {
			const command1 = commands.pausePrint();
			const command2 = commands.resumePrint();
			const command3 = commands.stopPrint();

			const id1 = parseInt(command1.print.sequence_id);
			const id2 = parseInt(command2.print.sequence_id);
			const id3 = parseInt(command3.print.sequence_id);

			expect(id2).toBe(id1 + 1);
			expect(id3).toBe(id2 + 1);
		});

		it('should reset sequence ID', () => {
			commands.pausePrint();
			commands.resumePrint();
			commands.resetSequenceId();

			const command = commands.pausePrint();
			expect(command.print.sequence_id).toBe('0');
		});

		it('should get current sequence ID', () => {
			commands.pausePrint();
			commands.resumePrint();

			expect(commands.getCurrentSequenceId()).toBe(2);
		});
	});
});
