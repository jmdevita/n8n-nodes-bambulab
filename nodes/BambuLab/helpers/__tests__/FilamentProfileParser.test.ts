import AdmZip from 'adm-zip';
import { FilamentProfileParser } from '../FilamentProfileParser';

/**
 * Helper function to create a mock .3mf file buffer
 * .3mf files are ZIP archives containing Metadata/plate_1.gcode
 */
function createMock3MF(gcodeContent: string): Buffer {
	const zip = new AdmZip();
	zip.addFile('Metadata/plate_1.gcode', Buffer.from(gcodeContent, 'utf8'));
	return zip.toBuffer();
}

describe('FilamentProfileParser', () => {
	describe('parseFromBuffer', () => {
		it('should parse single-filament .3mf (slot 2, black PETG)', () => {
			const gcode = `
; HEADER_BLOCK_START
; BambuStudio 02.03.00.70
; filament: 2
; HEADER_BLOCK_END

; CONFIG_BLOCK_START
; filament_colour = #515151;#000000;#68724D;#042F56;#2850E0
; filament_type = PETG;PETG;PLA;PLA;TPU
; filament_settings_id = "Bambu PETG HF @BBL X1C";"Bambu PETG HF @BBL X1C";"Bambu PLA Matte @BBL X1C";"Bambu PLA Matte @BBL X1C";"Polymaker TPU 95A"
; CONFIG_BLOCK_END
			`.trim();

			const buffer = createMock3MF(gcode);
			const result = FilamentProfileParser.parseFromBuffer(buffer);

			// Should have 1 profile (only slot 2 is used)
			expect(result.profiles.length).toBe(1);
			expect(result.totalEmbedded).toBe(5); // 5 total profiles in file

			// Check profile details
			const profile = result.profiles[0];
			expect(profile.index).toBe(1); // Profile at index 1 (black PETG)
			expect(profile.type).toBe('PETG');
			expect(profile.colour).toBe('#000000');
			expect(profile.name).toBe('Bambu PETG HF @BBL X1C');
			expect(profile.slotNumber).toBe(2); // AMS slot 2
			expect(profile.trayId).toBe(1); // Tray ID 1 (0-indexed)

			// Check mapping
			expect(result.detectedMapping).toEqual([1]); // Just tray 1
		});

		it('should parse multi-filament .3mf (slots 1,2, gray + black PETG)', () => {
			const gcode = `
; HEADER_BLOCK_START
; BambuStudio 02.03.00.70
; filament: 1,2
; total filament length [mm] : 2501.86,2492.10
; HEADER_BLOCK_END

; CONFIG_BLOCK_START
; filament_colour = #515151;#000000;#68724D;#042F56;#2850E0
; filament_type = PETG;PETG;PLA;PLA;TPU
; filament_settings_id = "Bambu PETG HF @BBL X1C";"Bambu PETG HF @BBL X1C";"Bambu PLA Matte @BBL X1C";"Bambu PLA Matte @BBL X1C";"Polymaker TPU 95A"
; CONFIG_BLOCK_END
			`.trim();

			const buffer = createMock3MF(gcode);
			const result = FilamentProfileParser.parseFromBuffer(buffer);

			// Should have 2 profiles (slots 1 and 2)
			expect(result.profiles.length).toBe(2);
			expect(result.totalEmbedded).toBe(5);

			// Check first profile (gray PETG, slot 1)
			expect(result.profiles[0].index).toBe(0);
			expect(result.profiles[0].type).toBe('PETG');
			expect(result.profiles[0].colour).toBe('#515151');
			expect(result.profiles[0].slotNumber).toBe(1);
			expect(result.profiles[0].trayId).toBe(0);

			// Check second profile (black PETG, slot 2)
			expect(result.profiles[1].index).toBe(1);
			expect(result.profiles[1].type).toBe('PETG');
			expect(result.profiles[1].colour).toBe('#000000');
			expect(result.profiles[1].slotNumber).toBe(2);
			expect(result.profiles[1].trayId).toBe(1);

			// Check mapping
			expect(result.detectedMapping).toEqual([0, 1]); // Trays 0 and 1
		});

		it('should parse 4-color print using all AMS slots', () => {
			const gcode = `
; filament: 1,2,3,4
; filament_colour = #FF0000;#00FF00;#0000FF;#FFFF00
; filament_type = PLA;PLA;PLA;PLA
; filament_settings_id = "Red PLA";"Green PLA";"Blue PLA";"Yellow PLA"
			`.trim();

			const buffer = createMock3MF(gcode);
			const result = FilamentProfileParser.parseFromBuffer(buffer);

			expect(result.profiles.length).toBe(4);
			expect(result.detectedMapping).toEqual([0, 1, 2, 3]);

			// Verify all colors
			expect(result.profiles[0].colour).toBe('#FF0000'); // Red
			expect(result.profiles[1].colour).toBe('#00FF00'); // Green
			expect(result.profiles[2].colour).toBe('#0000FF'); // Blue
			expect(result.profiles[3].colour).toBe('#FFFF00'); // Yellow
		});

		it('should handle non-sequential slot usage (slots 2,4)', () => {
			const gcode = `
; filament: 2,4
; filament_colour = #000000;#FFFFFF;#FF0000;#00FF00
; filament_type = PETG;PLA;PLA;TPU
; filament_settings_id = "Black PETG";"White PLA";"Red PLA";"Green TPU"
			`.trim();

			const buffer = createMock3MF(gcode);
			const result = FilamentProfileParser.parseFromBuffer(buffer);

			expect(result.profiles.length).toBe(2);

			// Slot 2 = profile index 1 (White PLA)
			expect(result.profiles[0].index).toBe(1);
			expect(result.profiles[0].type).toBe('PLA');
			expect(result.profiles[0].colour).toBe('#FFFFFF');

			// Slot 4 = profile index 3 (Green TPU)
			expect(result.profiles[1].index).toBe(3);
			expect(result.profiles[1].type).toBe('TPU');
			expect(result.profiles[1].colour).toBe('#00FF00');

			// Mapping should be [1, 3] (tray IDs for slots 2 and 4)
			expect(result.detectedMapping).toEqual([1, 3]);
		});
	});

	describe('error handling', () => {
		it('should throw error for invalid ZIP file', () => {
			const invalidBuffer = Buffer.from('This is not a ZIP file', 'utf8');

			expect(() => {
				FilamentProfileParser.parseFromBuffer(invalidBuffer);
			}).toThrow(/Not a valid ZIP archive/);
		});

		it('should throw error when Metadata/plate_1.gcode is missing', () => {
			const zip = new AdmZip();
			zip.addFile('some-other-file.txt', Buffer.from('hello', 'utf8'));
			const buffer = zip.toBuffer();

			expect(() => {
				FilamentProfileParser.parseFromBuffer(buffer);
			}).toThrow(/Metadata\/plate_1.gcode not found/);
		});

		it('should throw error when "; filament:" line is missing', () => {
			const gcode = `
; HEADER_BLOCK_START
; BambuStudio 02.03.00.70
; HEADER_BLOCK_END

; filament_colour = #515151;#000000
; filament_type = PETG;PETG
			`.trim();

			const buffer = createMock3MF(gcode);

			expect(() => {
				FilamentProfileParser.parseFromBuffer(buffer);
			}).toThrow(/"; filament:" line not found/);
		});

		it('should throw error when "; filament_type =" line is missing', () => {
			const gcode = `
; filament: 1,2
; filament_colour = #515151;#000000
			`.trim();

			const buffer = createMock3MF(gcode);

			expect(() => {
				FilamentProfileParser.parseFromBuffer(buffer);
			}).toThrow(/"; filament_type =" line not found/);
		});

		it('should throw error for invalid slot numbers', () => {
			const gcode = `
; filament: 1,5
; filament_type = PLA;PLA
; filament_colour = #FF0000;#00FF00
			`.trim();

			const buffer = createMock3MF(gcode);

			expect(() => {
				FilamentProfileParser.parseFromBuffer(buffer);
			}).toThrow(/Invalid AMS slot number.*Must be 1-4/);
		});

		it('should throw error when slot references non-existent profile', () => {
			const gcode = `
; filament: 4
; filament_type = PLA;PLA
; filament_colour = #FF0000;#00FF00
			`.trim();

			const buffer = createMock3MF(gcode);

			expect(() => {
				FilamentProfileParser.parseFromBuffer(buffer);
			}).toThrow(/Invalid profile index 3.*Only 2 profiles embedded/);
		});

		it('should handle missing colour data gracefully', () => {
			const gcode = `
; filament: 1
; filament_type = PLA
; filament_settings_id = "Generic PLA"
			`.trim();

			const buffer = createMock3MF(gcode);
			const result = FilamentProfileParser.parseFromBuffer(buffer);

			expect(result.profiles[0].colour).toBe('#FFFFFF'); // Default white
		});

		it('should handle missing name data gracefully', () => {
			const gcode = `
; filament: 1
; filament_type = PLA
; filament_colour = #FF0000
			`.trim();

			const buffer = createMock3MF(gcode);
			const result = FilamentProfileParser.parseFromBuffer(buffer);

			expect(result.profiles[0].name).toBe('Unknown Profile'); // Default name
		});
	});

	describe('edge cases', () => {
		it('should handle extra whitespace in values', () => {
			const gcode = `
; filament:  1 , 2
; filament_type =  PETG ; PLA
; filament_colour =  #515151 ; #000000
; filament_settings_id = "  Name 1  " ; "  Name 2  "
			`.trim();

			const buffer = createMock3MF(gcode);
			const result = FilamentProfileParser.parseFromBuffer(buffer);

			expect(result.profiles.length).toBe(2);
			expect(result.profiles[0].type).toBe('PETG');
			expect(result.profiles[1].type).toBe('PLA');
		});

		it('should handle empty lines and comments in gcode', () => {
			const gcode = `

; Some other comment
; filament: 1

; Another comment
; filament_type = PLA
; Random comment here
; filament_colour = #FF0000
			`.trim();

			const buffer = createMock3MF(gcode);
			const result = FilamentProfileParser.parseFromBuffer(buffer);

			expect(result.profiles.length).toBe(1);
			expect(result.profiles[0].type).toBe('PLA');
		});
	});
});
