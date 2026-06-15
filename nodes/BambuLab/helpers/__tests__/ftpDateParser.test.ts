import { parseFTPDate } from '../ftpDateParser';

describe('parseFTPDate', () => {
	describe('year-form: "Mmm DD YYYY"', () => {
		it('parses standard four-digit year format', () => {
			const d = parseFTPDate('Aug 18 2024');
			expect(d).toBeDefined();
			expect(d!.toISOString()).toBe('2024-08-18T00:00:00.000Z');
		});

		it('handles single-digit day', () => {
			const d = parseFTPDate('Jan 1 2025');
			expect(d!.toISOString()).toBe('2025-01-01T00:00:00.000Z');
		});

		it('handles padded two-digit day', () => {
			const d = parseFTPDate('Dec 03 2024');
			expect(d!.toISOString()).toBe('2024-12-03T00:00:00.000Z');
		});

		it('handles every month name correctly', () => {
			const cases: Array<[string, string]> = [
				['Jan 15 2025', '2025-01-15T00:00:00.000Z'],
				['Feb 15 2025', '2025-02-15T00:00:00.000Z'],
				['Mar 15 2025', '2025-03-15T00:00:00.000Z'],
				['Apr 15 2025', '2025-04-15T00:00:00.000Z'],
				['May 15 2025', '2025-05-15T00:00:00.000Z'],
				['Jun 15 2025', '2025-06-15T00:00:00.000Z'],
				['Jul 15 2025', '2025-07-15T00:00:00.000Z'],
				['Aug 15 2025', '2025-08-15T00:00:00.000Z'],
				['Sep 15 2025', '2025-09-15T00:00:00.000Z'],
				['Oct 15 2025', '2025-10-15T00:00:00.000Z'],
				['Nov 15 2025', '2025-11-15T00:00:00.000Z'],
				['Dec 15 2025', '2025-12-15T00:00:00.000Z'],
			];
			for (const [raw, expected] of cases) {
				expect(parseFTPDate(raw)?.toISOString()).toBe(expected);
			}
		});

		it('handles the Bambu epoch-zero filler "Jan 01 1980"', () => {
			const d = parseFTPDate('Jan 01 1980');
			expect(d!.toISOString()).toBe('1980-01-01T00:00:00.000Z');
		});
	});

	describe('time-form: "Mmm DD HH:MM" (year inferred)', () => {
		// Use a fixed "now" so the year-inference is deterministic.
		const NOW = new Date('2026-06-14T23:30:00Z').getTime();

		it('uses current year when the resulting date is before now', () => {
			// Jan 19 with current year (2026) is before 2026-06-14 → keep 2026.
			const d = parseFTPDate('Jan 19 18:27', NOW);
			expect(d!.toISOString()).toBe('2026-01-19T18:27:00.000Z');
		});

		it('uses current year for a date just after now within slack', () => {
			// Same calendar day as `now`, slightly later. Within 1-day slack → 2026.
			const d = parseFTPDate('Jun 15 12:00', NOW);
			expect(d!.toISOString()).toBe('2026-06-15T12:00:00.000Z');
		});

		it('rolls back to previous year when the result would be far in the future', () => {
			// Oct 27 in 2026 would be 4+ months in the future from 2026-06-14 → 2025.
			const d = parseFTPDate('Oct 27 14:30', NOW);
			expect(d!.toISOString()).toBe('2025-10-27T14:30:00.000Z');
		});

		it('handles single-digit hours and days', () => {
			const d = parseFTPDate('May 4 9:33', NOW);
			expect(d!.toISOString()).toBe('2026-05-04T09:33:00.000Z');
		});

		it('handles midnight 00:00', () => {
			const d = parseFTPDate('Mar 03 00:00', NOW);
			expect(d!.toISOString()).toBe('2026-03-03T00:00:00.000Z');
		});

		it('handles end-of-day 23:59', () => {
			const d = parseFTPDate('Mar 03 23:59', NOW);
			expect(d!.toISOString()).toBe('2026-03-03T23:59:00.000Z');
		});
	});

	describe('robustness', () => {
		it('returns undefined for empty / nullish input', () => {
			expect(parseFTPDate(undefined)).toBeUndefined();
			expect(parseFTPDate('')).toBeUndefined();
			expect(parseFTPDate('   ')).toBeUndefined();
		});

		it('returns undefined for unknown month names', () => {
			expect(parseFTPDate('Jna 15 2025')).toBeUndefined();
			expect(parseFTPDate('Xxx 15 2025')).toBeUndefined();
		});

		it('returns undefined for malformed strings', () => {
			expect(parseFTPDate('not-a-date')).toBeUndefined();
			expect(parseFTPDate('Jan 15')).toBeUndefined();
			expect(parseFTPDate('Jan 15 2025 extra')).toBeUndefined();
			expect(parseFTPDate('2025-01-15')).toBeUndefined(); // ISO format unsupported on purpose
		});

		it('trims surrounding whitespace', () => {
			const d = parseFTPDate('  Aug 18 2024  ');
			expect(d!.toISOString()).toBe('2024-08-18T00:00:00.000Z');
		});
	});
});
