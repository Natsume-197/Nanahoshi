import { describe, expect, test } from "bun:test";
import { CONFIRM_MS, createConnectivity, RECHECK_MS } from "./connectivity";

function harness({ connected = true, active = true } = {}) {
	const device = { connected, active };
	const changes: boolean[] = [];
	let now = 0;
	let timers: { at: number; run: () => void }[] = [];
	const connectivity = createConnectivity({
		read: async () => device.connected,
		isActive: () => device.active,
		setOnline: (online) => changes.push(online),
		after: (ms, run) => {
			const timer = { at: now + ms, run };
			timers.push(timer);
			return () => {
				timers = timers.filter((other) => other !== timer);
			};
		},
	});
	const advance = async (ms: number) => {
		now += ms;
		for (const timer of timers.filter((t) => t.at <= now)) {
			timers = timers.filter((other) => other !== timer);
			timer.run();
		}
		await Bun.sleep(0);
	};
	return { device, changes, connectivity, advance };
}

describe("createConnectivity", () => {
	test("a loss that comes back within the confirm window never shows offline", async () => {
		const { device, changes, connectivity, advance } = harness();
		device.connected = false;
		connectivity.networkChanged(false);
		await advance(CONFIRM_MS / 2);
		device.connected = true;
		connectivity.networkChanged(true);
		await advance(CONFIRM_MS * 2);
		expect(changes).toEqual([]);
	});

	test("a confirmed loss goes offline and recovers without any network event", async () => {
		const { device, changes, connectivity, advance } = harness();
		device.connected = false;
		connectivity.networkChanged(false);
		await advance(CONFIRM_MS);
		expect(changes).toEqual([false]);

		// Android lifts the block silently: only the recheck can notice.
		device.connected = true;
		await advance(RECHECK_MS);
		expect(changes).toEqual([false, true]);
	});

	test("losses reported in the background are ignored", async () => {
		const { device, changes, connectivity, advance } = harness();
		device.active = false;
		device.connected = false;
		connectivity.networkChanged(false);
		await advance(CONFIRM_MS * 5);
		expect(changes).toEqual([]);
	});

	test("coming back to the foreground asks the network again", async () => {
		const { device, changes, connectivity, advance } = harness();
		device.connected = false;
		connectivity.networkChanged(false);
		await advance(CONFIRM_MS);
		device.active = false;
		connectivity.background();

		device.active = true;
		device.connected = true;
		await connectivity.foreground();
		expect(changes).toEqual([false, true]);
		await advance(RECHECK_MS * 3);
		expect(changes).toEqual([false, true]);
	});

	test("the foreground check waits out a block that hasn't lifted yet", async () => {
		const { device, changes, connectivity, advance } = harness();
		device.connected = false;
		await connectivity.foreground();
		expect(changes).toEqual([]);
		device.connected = true;
		await advance(CONFIRM_MS);
		expect(changes).toEqual([]);
	});

	test("a real outage in the foreground stays offline", async () => {
		const { device, changes, connectivity, advance } = harness();
		device.connected = false;
		connectivity.networkChanged(false);
		await advance(CONFIRM_MS + RECHECK_MS * 4);
		expect(changes).toEqual([false]);
	});

	test("a newer event wins over a slower read", async () => {
		let release: (connected: boolean) => void = () => {};
		const changes: boolean[] = [];
		const connectivity = createConnectivity({
			read: () => new Promise((resolve) => (release = resolve)),
			isActive: () => true,
			setOnline: (online) => changes.push(online),
		});
		const asking = connectivity.foreground();
		connectivity.networkChanged(true);
		release(false);
		await asking;
		expect(changes).toEqual([]);
		connectivity.dispose();
	});
});
