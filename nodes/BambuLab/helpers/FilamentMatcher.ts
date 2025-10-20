import type {
	FilamentProfile,
	FilamentMatchResult,
	MatchedFilamentProfile,
	PrinterStatus,
	AMSStatus,
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
		// Check if AMS is present
		if (!currentStatus.ams || !currentStatus.ams.tray || currentStatus.ams.tray.length === 0) {
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

		// AMS present - match each profile strictly
		const mapping: number[] = [];
		const matches: MatchedFilamentProfile[] = [];

		for (const profile of profiles) {
			const match = this.findExactMatch(profile, currentStatus.ams);

			if (!match) {
				// Strict mode - fail immediately
				const available = this.formatAvailableFilaments(currentStatus.ams);
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
			totalSlots: currentStatus.ams.tray.length,
		};
	}

	/**
	 * Find exact match by type and normalized color
	 * Returns first match if multiple identical filaments exist
	 */
	private static findExactMatch(
		profile: FilamentProfile,
		ams: AMSStatus,
	): MatchedFilamentProfile | null {
		const normalizedProfileColor = this.normalizeColor(profile.colour);
		const normalizedProfileType = this.normalizeType(profile.type);

		for (const tray of ams.tray || []) {
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
	 *
	 * @param color Hex color code (with or without #)
	 * @returns Normalized uppercase hex without #
	 */
	private static normalizeColor(color: string): string {
		return color
			.trim()
			.toUpperCase()
			.replace(/^#/, '') // Remove leading #
			.replace(/\s+/g, ''); // Remove all whitespace
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
	 * @param ams Current AMS status
	 * @returns Human-readable string like "Slot 1: PLA (#FF0000), Slot 2: PETG (#000000)"
	 */
	private static formatAvailableFilaments(ams: AMSStatus): string {
		if (!ams.tray || ams.tray.length === 0) {
			return 'No filaments loaded';
		}

		return ams.tray
			.map((tray) => {
				const slot = parseInt(tray.id || '0', 10) + 1;
				const type = tray.tray_type || 'Unknown';
				const color = tray.tray_color || 'Unknown';
				return `Slot ${slot}: ${type} (${color})`;
			})
			.join(', ');
	}
}
