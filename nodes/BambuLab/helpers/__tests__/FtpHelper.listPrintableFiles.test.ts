import { Client as FTPClient } from 'basic-ftp';
import { BambuLabFtpClient } from '../FtpHelper';
import type { BambuLabCredentials } from '../types';

jest.mock('basic-ftp');

interface MockFileInfo {
	name: string;
	isDirectory: boolean;
	size: number;
	/**
	 * Raw FTP LIST date string (e.g. "Aug 18 2024" or "Jan 19 18:27").
	 * Defaults to the Bambu epoch-zero filler "Jan 01 1980" if unspecified.
	 */
	rawModifiedAt: string;
	permissions?: { user: number; group: number; world: number };
}

/**
 * Minimal mock of basic-ftp's Client surface used by BambuLabFtpClient.
 * Only the methods listPrintableFiles touches need to be implemented.
 */
class MockFtpClient {
	access = jest.fn(async () => undefined);
	list = jest.fn(async (_path: string): Promise<MockFileInfo[]> => []);
	close = jest.fn();
	closed = false;
	ftp = { socket: null };
}

const TEST_CREDS: BambuLabCredentials = {
	printerIp: '192.168.1.10',
	accessCode: 'test1234',
	serialNumber: 'SERIAL123',
	mqttPort: 8883,
	useTls: true,
	ftpPort: 990,
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateToRawLIST(d: Date): string {
	// Year-form: "Mmm DD YYYY" — fully deterministic, parseFTPDate handles it.
	return `${MONTH_NAMES[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')} ${d.getUTCFullYear()}`;
}

function file(
	name: string,
	opts: { size?: number; modifiedAt?: Date; isDirectory?: boolean; rawModifiedAt?: string } = {},
): MockFileInfo {
	return {
		name,
		isDirectory: opts.isDirectory ?? false,
		size: opts.size ?? 1024,
		rawModifiedAt:
			opts.rawModifiedAt ?? (opts.modifiedAt ? dateToRawLIST(opts.modifiedAt) : 'Jan 01 1980'),
	};
}

describe('BambuLabFtpClient.listPrintableFiles', () => {
	let mockClient: MockFtpClient;

	beforeEach(() => {
		mockClient = new MockFtpClient();
		(FTPClient as jest.MockedClass<typeof FTPClient>).mockImplementation(
			() => mockClient as unknown as FTPClient,
		);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('returns files from /sdcard when that root has content', async () => {
		mockClient.list.mockImplementation(async (path) => {
			if (path === '/sdcard/') {
				return [file('cube.3mf'), file('vase.3mf')];
			}
			return [];
		});

		const helper = new BambuLabFtpClient(TEST_CREDS);
		await helper.connect();
		const result = await helper.listPrintableFiles();

		expect(result).toHaveLength(2);
		expect(result.map((f) => f.name).sort()).toEqual(['/sdcard/cube.3mf', '/sdcard/vase.3mf']);
	});

	it('falls back to /cache when /sdcard listing throws', async () => {
		mockClient.list.mockImplementation(async (path) => {
			if (path === '/sdcard/') {
				throw new Error('550 No such directory');
			}
			if (path === '/cache/') {
				return [file('print.gcode.3mf')];
			}
			return [];
		});

		const helper = new BambuLabFtpClient(TEST_CREDS);
		await helper.connect();
		const result = await helper.listPrintableFiles();

		expect(result.map((f) => f.name)).toEqual(['/cache/print.gcode.3mf']);
		expect(mockClient.list).toHaveBeenCalledWith('/sdcard/');
		expect(mockClient.list).toHaveBeenCalledWith('/cache/');
	});

	it('falls back to / when both /sdcard and /cache fail', async () => {
		mockClient.list.mockImplementation(async (path) => {
			if (path === '/sdcard/') throw new Error('550');
			if (path === '/cache/') throw new Error('550');
			if (path === '/') return [file('rootfile.3mf')];
			return [];
		});

		const helper = new BambuLabFtpClient(TEST_CREDS);
		await helper.connect();
		const result = await helper.listPrintableFiles();

		expect(result.map((f) => f.name)).toEqual(['/rootfile.3mf']);
	});

	it('returns [] when every root probe fails', async () => {
		mockClient.list.mockRejectedValue(new Error('connection lost'));

		const helper = new BambuLabFtpClient(TEST_CREDS);
		await helper.connect();
		const result = await helper.listPrintableFiles();

		expect(result).toEqual([]);
		expect(mockClient.list).toHaveBeenCalledTimes(3); // /sdcard, /cache, /
	});

	it('drops hidden files but still returns content from other roots', async () => {
		mockClient.list.mockImplementation(async (path) => {
			if (path === '/sdcard/') {
				return [file('.cache_status'), file('.dump.bin')];
			}
			if (path === '/cache/') {
				return [file('real.3mf')];
			}
			return [];
		});

		const helper = new BambuLabFtpClient(TEST_CREDS);
		await helper.connect();
		const result = await helper.listPrintableFiles();

		expect(result.map((f) => f.name)).toEqual(['/cache/real.3mf']);
	});

	it('filters out directories from results', async () => {
		mockClient.list.mockImplementation(async (path) => {
			if (path === '/sdcard/') {
				return [
					file('Timelapse', { isDirectory: true }),
					file('model.3mf'),
					file('logs', { isDirectory: true }),
				];
			}
			return [];
		});

		const helper = new BambuLabFtpClient(TEST_CREDS);
		await helper.connect();
		const result = await helper.listPrintableFiles();

		expect(result.map((f) => f.name)).toEqual(['/sdcard/model.3mf']);
	});

	it('sorts merged results by modifiedTime descending (newest first)', async () => {
		const newest = new Date('2026-06-10T12:00:00Z');
		const middle = new Date('2026-06-08T12:00:00Z');
		const oldest = new Date('2026-06-01T12:00:00Z');

		mockClient.list.mockImplementation(async (path) => {
			if (path === '/sdcard/') {
				return [
					file('old.3mf', { modifiedAt: oldest }),
					file('new.3mf', { modifiedAt: newest }),
					file('mid.3mf', { modifiedAt: middle }),
				];
			}
			return [];
		});

		const helper = new BambuLabFtpClient(TEST_CREDS);
		await helper.connect();
		const result = await helper.listPrintableFiles();

		expect(result.map((f) => f.name)).toEqual([
			'/sdcard/new.3mf',
			'/sdcard/mid.3mf',
			'/sdcard/old.3mf',
		]);
	});

	it('caps results at MAX_FILE_LIST_RESULTS (200)', async () => {
		// Generate 250 files with descending mtimes so the cap is deterministic.
		// Year-form dates parse deterministically regardless of when the test runs.
		const many = Array.from({ length: 250 }, (_, i) =>
			file(`file-${String(i).padStart(3, '0')}.3mf`, {
				modifiedAt: new Date(Date.UTC(2024, 0, 1 + i)),
			}),
		);
		mockClient.list.mockImplementation(async (path) => {
			if (path === '/sdcard/') return many;
			return [];
		});

		const helper = new BambuLabFtpClient(TEST_CREDS);
		await helper.connect();
		const result = await helper.listPrintableFiles();

		expect(result).toHaveLength(200);
		// Newest 200 should remain (file-249 down through file-050).
		expect(result[0].name).toBe('/sdcard/file-249.3mf');
		expect(result[199].name).toBe('/sdcard/file-050.3mf');
	});

	describe('merge behavior', () => {
		it('merges files from multiple roots when more than one has content', async () => {
			mockClient.list.mockImplementation(async (path) => {
				if (path === '/sdcard/') {
					return [file('sdcard-file.3mf')];
				}
				if (path === '/cache/') {
					return [file('cache-file.gcode')];
				}
				if (path === '/') {
					return [file('root-file.gcode.3mf')];
				}
				return [];
			});

			const helper = new BambuLabFtpClient(TEST_CREDS);
			await helper.connect();
			const result = await helper.listPrintableFiles();

			expect(result.map((f) => f.name).sort()).toEqual([
				'/cache/cache-file.gcode',
				'/root-file.gcode.3mf',
				'/sdcard/sdcard-file.3mf',
			]);
		});

		it('interleaves files from different roots based on mtime', async () => {
			// User has a fresh sliced file at root (Bambu Studio modern flow)
			// and an older historical print in /cache. Newer wins regardless of root.
			const newer = new Date(Date.UTC(2026, 5, 14)); // Jun 14 2026
			const older = new Date(Date.UTC(2024, 7, 20)); // Aug 20 2024

			mockClient.list.mockImplementation(async (path) => {
				if (path === '/cache/') return [file('historical.gcode', { modifiedAt: older })];
				if (path === '/') return [file('fresh.gcode.3mf', { modifiedAt: newer })];
				return [];
			});

			const helper = new BambuLabFtpClient(TEST_CREDS);
			await helper.connect();
			const result = await helper.listPrintableFiles();

			expect(result.map((f) => f.name)).toEqual([
				'/fresh.gcode.3mf', // newer wins
				'/cache/historical.gcode',
			]);
		});

		it('skips a failing root without losing files from successful ones', async () => {
			// Reproduces the user's actual P1S environment: /sdcard 550s,
			// /cache returns content, / also returns content. Both contribute.
			mockClient.list.mockImplementation(async (path) => {
				if (path === '/sdcard/') throw new Error('550 No such directory');
				if (path === '/cache/') return [file('legacy.gcode')];
				if (path === '/') return [file('modern.gcode.3mf')];
				return [];
			});

			const helper = new BambuLabFtpClient(TEST_CREDS);
			await helper.connect();
			const result = await helper.listPrintableFiles();

			expect(result).toHaveLength(2);
			expect(result.map((f) => f.name).sort()).toEqual([
				'/cache/legacy.gcode',
				'/modern.gcode.3mf',
			]);
		});

		it('parses real Bambu rawModifiedAt strings into mtimes for sort', async () => {
			mockClient.list.mockImplementation(async (path) => {
				if (path === '/') {
					return [
						// Year-form format from Bambu's older entries.
						file('old.3mf', { rawModifiedAt: 'Aug 18 2024' }),
						file('newer.3mf', { rawModifiedAt: 'Oct 27 2025' }),
					];
				}
				return [];
			});

			const helper = new BambuLabFtpClient(TEST_CREDS);
			await helper.connect();
			const result = await helper.listPrintableFiles();

			expect(result.map((f) => f.name)).toEqual(['/newer.3mf', '/old.3mf']);
			// Confirm the date parser populated modifiedTime, not just leaving it undefined.
			expect(result[0].modifiedTime?.toISOString()).toBe('2025-10-27T00:00:00.000Z');
			expect(result[1].modifiedTime?.toISOString()).toBe('2024-08-18T00:00:00.000Z');
		});
	});
});
