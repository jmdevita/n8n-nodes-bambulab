import type {
	FilamentProfile,
	FilamentMatchResult,
	MatchedFilamentProfile,
	PrinterStatus,
	AMSTray,
} from './types';

/**
 * Matcher for mapping .3mf filament profiles to current AMS configuration
 *
 * Performs strict matching (type + color) to ensure correct filaments are used.
 * Prevents printing with wrong colors or materials by validating against
 * actual AMS contents at print time.
 */
export class FilamentMatcher {
	/**
	 * Match .3mf filament profiles to current AMS state
	 *
	 * @param profiles Filament profiles parsed from .3mf file
	 * @param currentStatus Current printer status including AMS data
	 * @returns Mapping result with matched slots
	 * @throws Error if required filament not found in AMS
	 *
	 * @example
	 * const profiles = parser.parseFromBuffer(buffer).profiles;
	 * const status = await mqttClient.getStatus();
	 * const result = FilamentMatcher.matchProfilesToAMS(profiles, status);
	 * // result.mapping = [2, 3] means use slots 3 and 4
	 */
	static matchProfilesToAMS(
		profiles: FilamentProfile[],
		currentStatus: PrinterStatus,
	): FilamentMatchResult {
		// AMS data is always nested under print.ams
		const amsData = (currentStatus as any).print?.ams;

		// Check if AMS is present - actual structure has print.ams.ams[] array
		if (!amsData || !amsData.ams || amsData.ams.length === 0) {
			// No AMS detected - assume external spool
			// Use tray 0 for all filaments
			return {
				mapping: profiles.map(() => 0),
				matches: profiles.map((p) => ({
					...p,
					matchedSlot: 1,
					matchedTrayId: 0,
					matchQuality: 'exact',
					currentColor: p.colour,
					currentType: p.type,
				})),
				amsDetected: false,
				totalSlots: 1,
			};
		}

		// Get all trays from all AMS units (flatten array)
		// A1 series has 1 AMS unit with 4 trays
		const allTrays = amsData.ams.flatMap((unit: any) => unit.tray || []);

		if (allTrays.length === 0) {
			// AMS exists but no trays loaded
			return {
				mapping: profiles.map(() => 0),
				matches: profiles.map((p) => ({
					...p,
					matchedSlot: 1,
					matchedTrayId: 0,
					matchQuality: 'exact',
					currentColor: p.colour,
					currentType: p.type,
				})),
				amsDetected: false,
				totalSlots: 1,
			};
		}

		// AMS present - match each profile strictly
		const mapping: number[] = [];
		const matches: MatchedFilamentProfile[] = [];

		for (const profile of profiles) {
			const match = this.findExactMatch(profile, allTrays);

			if (!match) {
				// Strict mode - fail immediately
				const available = this.formatAvailableFilaments(allTrays);
				throw new Error(
					`Filament not found in AMS: Need ${profile.type} (${profile.colour}) ` +
						`for profile ${profile.index}. Available: ${available}`,
				);
			}

			mapping.push(match.matchedTrayId);
			matches.push(match);
		}

		return {
			mapping,
			matches,
			amsDetected: true,
			totalSlots: allTrays.length,
		};
	}

	/**
	 * Find exact match by type and normalized color
	 * Returns first match if multiple identical filaments exist
	 */
	private static findExactMatch(
		profile: FilamentProfile,
		trays: AMSTray[],
	): MatchedFilamentProfile | null {
		const normalizedProfileColor = this.normalizeColor(profile.colour);
		const normalizedProfileType = this.normalizeType(profile.type);

		for (const tray of trays) {
			const trayColor = this.normalizeColor(tray.tray_color || '');
			const trayType = this.normalizeType(tray.tray_type || '');

			// Check for exact match (type AND color)
			if (trayType === normalizedProfileType && trayColor === normalizedProfileColor) {
				// Found exact match - use it (first match if duplicates exist)
				const trayId = parseInt(tray.id || '0', 10);
				return {
					...profile,
					matchedSlot: trayId + 1, // Convert 0-indexed to 1-indexed for display
					matchedTrayId: trayId,
					matchQuality: 'exact',
					currentColor: tray.tray_color || '',
					currentType: tray.tray_type || '',
				};
			}
		}

		return null; // No match found
	}

	/**
	 * Normalize color hex code for comparison
	 *
	 * Handles variations:
	 * - Case: #FF0000 = #ff0000
	 * - Leading #: #FF0000 = FF0000
	 * - Whitespace: " #FF0000 " = "#FF0000"
	 * - Alpha channel: 515151FF = 515151 (printer reports 8 chars, .3mf has 6)
	 *
	 * @param color Hex color code (with or without #, with or without alpha)
	 * @returns Normalized uppercase hex without # (6 chars)
	 */
	private static normalizeColor(color: string): string {
		let normalized = color
			.trim()
			.toUpperCase()
			.replace(/^#/, '') // Remove leading #
			.replace(/\s+/g, ''); // Remove all whitespace

		// Strip alpha channel if present (8+ chars -> 6 chars)
		// Printer reports: 515151FF, .3mf has: 515151
		if (normalized.length >= 8) {
			normalized = normalized.substring(0, 6);
		}

		return normalized;
	}

	/**
	 * Normalize filament type for comparison
	 *
	 * Handles variations:
	 * - Case: PLA = pla = Pla
	 * - Whitespace: " PLA " = "PLA"
	 *
	 * @param type Filament type string
	 * @returns Normalized uppercase type
	 */
	private static normalizeType(type: string): string {
		return type.trim().toUpperCase();
	}

	/**
	 * Format available filaments for error messages
	 *
	 * @param trays Array of AMS trays
	 * @returns Human-readable string like "Slot 1: PLA (#FF0000), Slot 2: PETG (#000000)"
	 */
	private static formatAvailableFilaments(trays: AMSTray[]): string {
		if (!trays || trays.length === 0) {
			return 'No filaments loaded';
		}

		return trays
			.map((tray) => {
				const slot = parseInt(tray.id || '0', 10) + 1;
				const type = tray.tray_type || 'Unknown';
				const color = tray.tray_color || 'Unknown';
				return `Slot ${slot}: ${type} (${color})`;
			})
			.join(', ');
	}
}
