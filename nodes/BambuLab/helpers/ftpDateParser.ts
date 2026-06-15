/**
 * Bambu Lab printers report FTP LIST timestamps in two standard Unix
 * `ls -l` formats depending on how recent the file is:
 *
 *   - Older than ~6 months: "Mmm DD YYYY"   e.g. "Aug 18 2024"
 *   - Within ~6 months:     "Mmm DD HH:MM"  e.g. "Jan 19 18:27"
 *
 * basic-ftp captures these as `rawModifiedAt` but only fills the parsed
 * `modifiedAt: Date` field for MLSD responses (which Bambu doesn't support).
 * This helper parses the LIST format so the resourceLocator dropdown can
 * sort by mtime and render "time ago" labels.
 *
 * The year-less variant infers the year by trying the current year first
 * and rolling back to the previous year if the resulting date would be
 * meaningfully in the future. Standard `ls` uses ~6 months as the cutoff,
 * but a small slack avoids clock-skew misclassifications around the boundary.
 */

const MONTHS: Record<string, number> = {
	Jan: 0,
	Feb: 1,
	Mar: 2,
	Apr: 3,
	May: 4,
	Jun: 5,
	Jul: 6,
	Aug: 7,
	Sep: 8,
	Oct: 9,
	Nov: 10,
	Dec: 11,
};

/**
 * Parse a Bambu FTP LIST timestamp string into a Date in UTC.
 *
 * @param raw The raw timestamp string from basic-ftp's FileInfo.rawModifiedAt
 * @param now Reference timestamp for inferring the year of year-less entries.
 *            Defaults to Date.now(); injectable for tests.
 * @returns A Date if parsed successfully, undefined otherwise.
 */
export function parseFTPDate(raw: string | undefined, now: number = Date.now()): Date | undefined {
	if (!raw || typeof raw !== 'string') return undefined;
	const trimmed = raw.trim();

	// Form 1: "Mmm DD YYYY" — explicit year.
	const yearMatch = trimmed.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})$/);
	if (yearMatch) {
		const [, mon, day, year] = yearMatch;
		const monthIdx = MONTHS[mon];
		if (monthIdx === undefined) return undefined;
		return new Date(Date.UTC(parseInt(year, 10), monthIdx, parseInt(day, 10)));
	}

	// Form 2: "Mmm DD HH:MM" — year inferred.
	const timeMatch = trimmed.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
	if (timeMatch) {
		const [, mon, day, hour, min] = timeMatch;
		const monthIdx = MONTHS[mon];
		if (monthIdx === undefined) return undefined;

		const reference = new Date(now);
		const currentYear = reference.getUTCFullYear();

		const tryYear = (year: number): Date =>
			new Date(
				Date.UTC(year, monthIdx, parseInt(day, 10), parseInt(hour, 10), parseInt(min, 10)),
			);

		const guessCurrent = tryYear(currentYear);
		// Allow up to 1 day of slack for clock skew (file timestamps slightly
		// ahead of `now` should still be treated as current-year).
		const futureSlackMs = 24 * 60 * 60 * 1000;
		if (guessCurrent.getTime() > now + futureSlackMs) {
			return tryYear(currentYear - 1);
		}
		return guessCurrent;
	}

	return undefined;
}
