import { describe, expect, mock, test } from "bun:test";
import type { PresenceEvent } from "../presence.types";

// The default rosterHub singleton wires membersRepository (→ db/env) and
// presenceManager (→ redis) — mock those chains so importing the module is
// side-effect free. The class under test only uses injected deps.
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));
mock.module("../presenceManager", () => ({
	subscribeToPresence: mock(() => ({ update: () => {}, close: () => {} })),
	getPresenceFor: mock(() => Promise.resolve(new Map())),
	syncStatus: mock(() => Promise.resolve()),
	heartbeatOnline: mock(() => Promise.resolve()),
	clearConnection: mock(() => Promise.resolve()),
	markActivity: mock(() => Promise.resolve()),
	clearActivity: mock(() => Promise.resolve()),
	setIdle: mock(() => Promise.resolve()),
	setManualStatus: mock(() => Promise.resolve()),
}));

const { RosterHub } = await import("../rosterHub");

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

type Sub = {
	ids: string[];
	onEvent: (event: PresenceEvent) => void;
	updates: string[][];
	closed: boolean;
};

function createHarness(initialIds: Record<string, string[]>) {
	const memberIds = { ...initialIds };
	const loads: string[] = [];
	const subs: Sub[] = [];
	const hub = new RosterHub({
		loadMemberIds: (serverId: string) => {
			loads.push(serverId);
			return Promise.resolve(memberIds[serverId] ?? []);
		},
		subscribe: (ids, onEvent) => {
			const sub: Sub = { ids: [...ids], onEvent, updates: [], closed: false };
			subs.push(sub);
			return {
				update: (next: Iterable<string>) => sub.updates.push([...next]),
				close: () => {
					sub.closed = true;
				},
			};
		},
		refreshMs: 60_000,
	});
	return { hub, loads, subs, memberIds };
}

function createSink() {
	const events: PresenceEvent[] = [];
	let rosterChanges = 0;
	return {
		sink: {
			onPresence: (event: PresenceEvent) => events.push(event),
			onRosterChanged: () => {
				rosterChanges++;
			},
		},
		events,
		rosterChanged: () => rosterChanges,
	};
}

describe("RosterHub", () => {
	test("connections on the same server share one subscription and one load", async () => {
		const { hub, loads, subs } = createHarness({ s1: ["u2", "u1"] });
		const a = createSink();
		const b = createSink();

		const [leaveA, leaveB] = await Promise.all([
			hub.join("s1", a.sink),
			hub.join("s1", b.sink),
		]);

		expect(loads).toEqual(["s1"]);
		expect(subs).toHaveLength(1);
		// Roster ids are sorted for a stable signature.
		expect(subs[0].ids).toEqual(["u1", "u2"]);

		const event: PresenceEvent = { userId: "u1", state: "reading", book: null };
		subs[0].onEvent(event);
		expect(a.events).toEqual([event]);
		expect(b.events).toEqual([event]);

		leaveA();
		leaveB();
	});

	test("different servers get independent subscriptions", async () => {
		const { hub, subs } = createHarness({ s1: ["u1"], s2: ["u2"] });
		await hub.join("s1", createSink().sink);
		await hub.join("s2", createSink().sink);
		expect(subs).toHaveLength(2);
	});

	test("invalidate re-points the subscription and notifies sinks on change", async () => {
		const harness = createHarness({ s1: ["u1", "u2"] });
		const a = createSink();
		await harness.hub.join("s1", a.sink);

		harness.memberIds.s1 = ["u1", "u2", "u3"];
		harness.hub.invalidate("s1");
		await settle();

		expect(harness.subs[0].updates).toEqual([["u1", "u2", "u3"]]);
		expect(a.rosterChanged()).toBe(1);
	});

	test("invalidate with an unchanged roster is a no-op", async () => {
		const harness = createHarness({ s1: ["u1", "u2"] });
		const a = createSink();
		await harness.hub.join("s1", a.sink);

		harness.hub.invalidate("s1");
		await settle();

		expect(harness.subs[0].updates).toEqual([]);
		expect(a.rosterChanged()).toBe(0);
	});

	test("last leave closes the subscription; a new join starts fresh", async () => {
		const harness = createHarness({ s1: ["u1"] });
		const leaveA = await harness.hub.join("s1", createSink().sink);
		const leaveB = await harness.hub.join("s1", createSink().sink);

		leaveA();
		expect(harness.subs[0].closed).toBe(false);
		leaveB();
		expect(harness.subs[0].closed).toBe(true);

		await harness.hub.join("s1", createSink().sink);
		expect(harness.loads).toEqual(["s1", "s1"]);
		expect(harness.subs).toHaveLength(2);
	});

	test("a failed initial load rejects the join and the next join retries", async () => {
		let fail = true;
		const loads: string[] = [];
		const hub = new RosterHub({
			loadMemberIds: (serverId: string) => {
				loads.push(serverId);
				return fail
					? Promise.reject(new Error("db down"))
					: Promise.resolve(["u1"]);
			},
			subscribe: () => ({ update: () => {}, close: () => {} }),
			refreshMs: 60_000,
		});

		expect(hub.join("s1", createSink().sink)).rejects.toThrow("db down");
		await settle();

		fail = false;
		const leave = await hub.join("s1", createSink().sink);
		expect(loads).toEqual(["s1", "s1"]);
		leave();
	});
});
