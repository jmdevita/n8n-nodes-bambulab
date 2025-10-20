import { FilamentMatcher } from '../FilamentMatcher';
import type {
	FilamentProfile,
	PrinterStatus,
	AMSStatus,
	FilamentMatchResult,
} from '../types';

describe('FilamentMatcher', () => {
	// Helper to create mock AMS status (new structure with ams.ams[] array)
	const createMockAMS = (trays: Array<{ id: string; type: string; color: string }>): AMSStatus => ({
		ams: [
			{
				id: '0',
				humidity: '50',
				temp: '25',
				tray: trays.map((t) => ({
					id: t.id,
					tray_type: t.type,
					tray_color: t.color,
					remain: 100,
				})),
			},
		],
		ams_exist_bits: '1',
		tray_exist_bits: 'f',
		version: 2,
	});

	// Helper to create mock printer status
	// AMS data is always nested under print.ams in real MQTT messages
	const createMockStatus = (ams?: AMSStatus): PrinterStatus => ({
		print: {
			ams,
		} as any,
		gcode_state: 'IDLE',
	});

	// Helper to create mock filament profile
	const createProfile = (index: number, type: string, colour: string): FilamentProfile => ({
		index,
		type,
		colour,
		name: `${type} ${colour}`,
		slotNumber: index + 1,
		trayId: index,
	});

	describe('matchProfilesToAMS', () => {
		it('should match single filament to correct slot', () => {
			// Setup: Need black PETG, available in slot 2 (tray ID 1)
			const profiles: FilamentProfile[] = [
				createProfile(0, 'PETG', '#000000'),
			];

			const ams = createMockAMS([
				{ id: '0', type: 'PETG', color: '#515151' }, // Gray
				{ id: '1', type: 'PETG', color: '#000000' }, // Black
				{ id: '2', type: 'PLA', color: '#68724D' },  // Green
				{ id: '3', type: 'PLA', color: '#042F56' },  // Blue
			]);

			const status = createMockStatus(ams);

			// Execute
			const result: FilamentMatchResult = FilamentMatcher.matchProfilesToAMS(profiles, status);

			// Verify
			expect(result.mapping).toEqual([1]); // Tray ID 1
			expect(result.matches).toHaveLength(1);
			expect(result.matches[0].matchedSlot).toBe(2); // Slot 2 (1-indexed)
			expect(result.matches[0].matchedTrayId).toBe(1); // Tray ID 1
			expect(result.matches[0].matchQuality).toBe('exact');
			expect(result.matches[0].currentColor).toBe('#000000');
			expect(result.matches[0].currentType).toBe('PETG');
			expect(result.amsDetected).toBe(true);
			expect(result.totalSlots).toBe(4);
		});

		it('should match multiple filaments to correct slots', () => {
			// Setup: Need gray PETG and black PETG
			const profiles: FilamentProfile[] = [
				createProfile(0, 'PETG', '#515151'), // Gray
				createProfile(1, 'PETG', '#000000'), // Black
			];

			const ams = createMockAMS([
				{ id: '0', type: 'PETG', color: '#515151' }, // Gray - slot 1
				{ id: '1', type: 'PETG', color: '#000000' }, // Black - slot 2
				{ id: '2', type: 'PLA', color: '#68724D' },  // Green - slot 3
				{ id: '3', type: 'PLA', color: '#042F56' },  // Blue - slot 4
			]);

			const status = createMockStatus(ams);

			// Execute
			const result: FilamentMatchResult = FilamentMatcher.matchProfilesToAMS(profiles, status);

			// Verify
			expect(result.mapping).toEqual([0, 1]); // Tray IDs 0 and 1
			expect(result.matches).toHaveLength(2);
			expect(result.matches[0].matchedSlot).toBe(1); // Slot 1
			expect(result.matches[0].matchedTrayId).toBe(0); // Tray ID 0
			expect(result.matches[1].matchedSlot).toBe(2); // Slot 2
			expect(result.matches[1].matchedTrayId).toBe(1); // Tray ID 1
			expect(result.amsDetected).toBe(true);
		});

		it('should use first match when duplicate filaments exist', () => {
			// Setup: Need black PETG, but it's in slots 2 AND 4
			const profiles: FilamentProfile[] = [
				createProfile(0, 'PETG', '#000000'),
			];

			const ams = createMockAMS([
				{ id: '0', type: 'PETG', color: '#515151' }, // Gray - slot 1
				{ id: '1', type: 'PETG', color: '#000000' }, // Black - slot 2 (FIRST)
				{ id: '2', type: 'PLA', color: '#68724D' },  // Green - slot 3
				{ id: '3', type: 'PETG', color: '#000000' }, // Black - slot 4 (DUPLICATE)
			]);

			const status = createMockStatus(ams);

			// Execute
			const result: FilamentMatchResult = FilamentMatcher.matchProfilesToAMS(profiles, status);

			// Verify - should use first match (slot 2, tray ID 1)
			expect(result.mapping).toEqual([1]); // First match: tray ID 1
			expect(result.matches[0].matchedSlot).toBe(2); // First match: slot 2
			expect(result.matches[0].matchedTrayId).toBe(1);
		});

		it('should normalize color codes correctly', () => {
			// Setup: Test various color code formats
			const profiles: FilamentProfile[] = [
				createProfile(0, 'PETG', 'FF0000'), // No #
			];

			const ams = createMockAMS([
				{ id: '0', type: 'PETG', color: '#ff0000' }, // Lowercase with #
			]);

			const status = createMockStatus(ams);

			// Execute
			const result: FilamentMatchResult = FilamentMatcher.matchProfilesToAMS(profiles, status);

			// Verify - should match despite different formats
			expect(result.mapping).toEqual([0]);
			expect(result.matches[0].matchedSlot).toBe(1);
		});

		it('should normalize filament types correctly', () => {
			// Setup: Test various type formats
			const profiles: FilamentProfile[] = [
				createProfile(0, 'pla', '#000000'), // Lowercase
			];

			const ams = createMockAMS([
				{ id: '0', type: 'PLA', color: '#000000' }, // Uppercase
			]);

			const status = createMockStatus(ams);

			// Execute
			const result: FilamentMatchResult = FilamentMatcher.matchProfilesToAMS(profiles, status);

			// Verify - should match despite different case
			expect(result.mapping).toEqual([0]);
			expect(result.matches[0].matchedSlot).toBe(1);
		});

		it('should handle no AMS (external spool) scenario', () => {
			// Setup: No AMS detected
			const profiles: FilamentProfile[] = [
				createProfile(0, 'PETG', '#000000'),
			];

			const status = createMockStatus(); // No AMS

			// Execute
			const result: FilamentMatchResult = FilamentMatcher.matchProfilesToAMS(profiles, status);

			// Verify - should use tray 0 for all
			expect(result.mapping).toEqual([0]);
			expect(result.matches).toHaveLength(1);
			expect(result.matches[0].matchedSlot).toBe(1);
			expect(result.matches[0].matchedTrayId).toBe(0);
			expect(result.matches[0].matchQuality).toBe('exact');
			expect(result.amsDetected).toBe(false);
			expect(result.totalSlots).toBe(1);
		});

		it('should throw error when filament type not found in AMS', () => {
			// Setup: Need TPU but only PETG and PLA available
			const profiles: FilamentProfile[] = [
				createProfile(0, 'TPU', '#000000'),
			];

			const ams = createMockAMS([
				{ id: '0', type: 'PETG', color: '#515151' },
				{ id: '1', type: 'PETG', color: '#000000' },
				{ id: '2', type: 'PLA', color: '#68724D' },
				{ id: '3', type: 'PLA', color: '#042F56' },
			]);

			const status = createMockStatus(ams);

			// Execute & Verify
			expect(() => {
				FilamentMatcher.matchProfilesToAMS(profiles, status);
			}).toThrow('Filament not found in AMS: Need TPU (#000000) for profile 0');
		});

		it('should throw error when color not found in AMS', () => {
			// Setup: Need red PETG but only gray and black available
			const profiles: FilamentProfile[] = [
				createProfile(0, 'PETG', '#FF0000'), // Red
			];

			const ams = createMockAMS([
				{ id: '0', type: 'PETG', color: '#515151' }, // Gray
				{ id: '1', type: 'PETG', color: '#000000' }, // Black
				{ id: '2', type: 'PLA', color: '#68724D' },
				{ id: '3', type: 'PLA', color: '#042F56' },
			]);

			const status = createMockStatus(ams);

			// Execute & Verify
			expect(() => {
				FilamentMatcher.matchProfilesToAMS(profiles, status);
			}).toThrow('Filament not found in AMS: Need PETG (#FF0000) for profile 0');
		});

		it('should throw error when type matches but color does not', () => {
			// Setup: Need black PLA but only green and blue PLA available
			const profiles: FilamentProfile[] = [
				createProfile(0, 'PLA', '#000000'), // Black
			];

			const ams = createMockAMS([
				{ id: '0', type: 'PETG', color: '#515151' },
				{ id: '1', type: 'PETG', color: '#000000' }, // Black PETG (wrong type)
				{ id: '2', type: 'PLA', color: '#68724D' },  // Green PLA (wrong color)
				{ id: '3', type: 'PLA', color: '#042F56' },  // Blue PLA (wrong color)
			]);

			const status = createMockStatus(ams);

			// Execute & Verify
			expect(() => {
				FilamentMatcher.matchProfilesToAMS(profiles, status);
			}).toThrow('Filament not found in AMS: Need PLA (#000000) for profile 0');
		});

		it('should handle empty AMS trays array', () => {
			// Setup: AMS exists but no trays loaded
			const profiles: FilamentProfile[] = [
				createProfile(0, 'PETG', '#000000'),
			];

			const ams: AMSStatus = {
				ams: [
					{
						id: '0',
						humidity: '50',
						temp: '25',
						tray: [], // Empty array
					},
				],
				ams_exist_bits: '1',
				version: 2,
			};

			const status = createMockStatus(ams);

			// Execute - should treat as no AMS
			const result: FilamentMatchResult = FilamentMatcher.matchProfilesToAMS(profiles, status);

			// Verify
			expect(result.mapping).toEqual([0]);
			expect(result.amsDetected).toBe(false);
			expect(result.totalSlots).toBe(1);
		});

		it('should format available filaments correctly in error messages', () => {
			// Setup: Create scenario that will trigger error
			const profiles: FilamentProfile[] = [
				createProfile(0, 'TPU', '#FF0000'), // Red TPU (not available)
			];

			const ams = createMockAMS([
				{ id: '0', type: 'PETG', color: '#515151' },
				{ id: '1', type: 'PETG', color: '#000000' },
				{ id: '2', type: 'PLA', color: '#68724D' },
				{ id: '3', type: 'PLA', color: '#042F56' },
			]);

			const status = createMockStatus(ams);

			// Execute & Verify error message format
			expect(() => {
				FilamentMatcher.matchProfilesToAMS(profiles, status);
			}).toThrow(/Available: Slot 1: PETG \(#515151\), Slot 2: PETG \(#000000\), Slot 3: PLA \(#68724D\), Slot 4: PLA \(#042F56\)/);
		});
	});
});
