import { EventEmitter } from 'events';
import * as mqtt from 'mqtt';
import { BambuLabMqttClient } from '../MqttHelper';
import type { BambuLabCredentials, PrintCommand } from '../types';

jest.mock('mqtt');

/**
 * Minimal mock of the mqtt.js client surface used by BambuLabMqttClient.
 * Extends EventEmitter so .on/.emit/.removeListener/.removeAllListeners
 * behave exactly like the real client.
 */
class MockMqttClient extends EventEmitter {
	connected = false;
	subscribe = jest.fn((_topic: string, cb: (err: Error | null) => void) => {
		// Real client invokes the subscribe callback asynchronously after the
		// SUBACK arrives. Defer one tick so handlers wired in 'connect' run first.
		setImmediate(() => cb(null));
	});
	publish = jest.fn();
	end = jest.fn(
		(_force?: boolean, opts?: unknown, cb?: () => void) => {
			// Mimic mqtt.js: end(force, opts?, cb?) — cb may be in opts slot.
			const callback = typeof opts === 'function' ? (opts as () => void) : cb;
			if (callback) setImmediate(callback);
		},
	);
}

const TEST_CREDS: BambuLabCredentials = {
	printerIp: '192.168.1.10',
	accessCode: 'test1234',
	serialNumber: 'SERIAL123',
	mqttPort: 8883,
	useTls: true,
	ftpPort: 990,
};

/**
 * Wire a fresh mock client into mqtt.connect and walk the BambuLabMqttClient
 * through a successful handshake. Returns the connected helper + mock so each
 * test can drive 'message' events and assertions directly.
 */
async function connectHelper(): Promise<{
	helper: BambuLabMqttClient;
	mockClient: MockMqttClient;
}> {
	const mockClient = new MockMqttClient();
	(mqtt.connect as jest.Mock).mockReturnValue(mockClient);

	const helper = new BambuLabMqttClient(TEST_CREDS);
	const connectPromise = helper.connect();

	// Let mqtt.connect resolve and 'connect'/'error'/'close' handlers register
	await Promise.resolve();
	mockClient.connected = true;
	mockClient.emit('connect');

	// Flush the deferred subscribe callback so connectPromise can resolve
	await connectPromise;

	return { helper, mockClient };
}

const reportTopic = `device/${TEST_CREDS.serialNumber}/report`;

function emitMessage(mockClient: MockMqttClient, payload: object): void {
	mockClient.emit('message', reportTopic, Buffer.from(JSON.stringify(payload)));
}

describe('BambuLabMqttClient', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('publishCommand with waitForResponse', () => {
		it('rejects on timeout when no message matches the sequence_id', async () => {
			const { helper, mockClient } = await connectHelper();
			// Shrink the response timeout so the test can run without fake timers.
			(helper as unknown as { responseTimeout: number }).responseTimeout = 150;

			const command: PrintCommand = {
				print: { sequence_id: 'unique-seq-1', command: 'pause' },
			};

			const responsePromise = helper.publishCommand(command, true);

			// Flood the buffer with unrelated status messages — these would have
			// resolved the old "take last message" fallback. With strict matching
			// they must be ignored and the call must time out.
			emitMessage(mockClient, { print: { sequence_id: 'other-1', mc_percent: 10 } });
			emitMessage(mockClient, { print: { sequence_id: 'other-2', mc_percent: 12 } });

			await expect(responsePromise).rejects.toThrow(/timeout/i);

			await helper.disconnect();
		});

		it('resolves with the exact sequence_id match even with noise in the buffer', async () => {
			const { helper, mockClient } = await connectHelper();
			(helper as unknown as { responseTimeout: number }).responseTimeout = 1000;

			const command: PrintCommand = {
				print: { sequence_id: 'expected-seq-42', command: 'pause' },
			};

			const responsePromise = helper.publishCommand(command, true);

			// Noise arrives first (different sequence_ids, unrelated status updates).
			emitMessage(mockClient, { print: { sequence_id: 'noise-1', mc_percent: 5 } });
			emitMessage(mockClient, { print: { mc_percent: 8 } });
			// Now the real ACK arrives.
			emitMessage(mockClient, {
				print: { sequence_id: 'expected-seq-42', command: 'pause', msg: 0 },
			});

			const result = await responsePromise;

			expect(result.success).toBe(true);
			expect(result.sequence_id).toBe('expected-seq-42');
			// data should be the matching message, not the noise.
			const data = result.data as { print?: { sequence_id?: string } };
			expect(data.print?.sequence_id).toBe('expected-seq-42');

			await helper.disconnect();
		});
	});

	describe('disconnect timer cleanup', () => {
		it('clears polling intervals from an in-flight publishCommand', async () => {
			const { helper, mockClient } = await connectHelper();
			(helper as unknown as { responseTimeout: number }).responseTimeout = 60_000;

			const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

			const command: PrintCommand = {
				print: { sequence_id: 'abandoned-seq', command: 'pause' },
			};

			// Start the publish but DON'T await it — simulating a workflow that
			// gets cancelled mid-poll. Capture the rejection so Node doesn't
			// flag it as unhandled when disconnect tears the timer down.
			const abandoned = helper.publishCommand(command, true);
			abandoned.catch(() => {
				/* expected — disconnect kills the poller */
			});

			// Let publishCommand install its setInterval.
			await Promise.resolve();
			await Promise.resolve();

			const baselineClearIntervalCalls = clearIntervalSpy.mock.calls.length;

			await helper.disconnect();

			// disconnect() should call clearInterval at least once for the
			// in-flight poller. (disconnect itself uses setTimeout, not
			// setInterval, so clearInterval delta is unambiguous.)
			expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(
				baselineClearIntervalCalls,
			);
			// And it should have removed listeners from the mock client.
			expect(mockClient.listenerCount('message')).toBe(0);

			clearIntervalSpy.mockRestore();
			// Settle the abandoned promise to keep Jest tidy.
			void mockClient;
		});
	});
});
