import { beforeEach, describe, expect, mock, test } from "bun:test";

const publishMock = mock(() => Promise.resolve());
const setMock = mock(() => Promise.resolve("OK"));
const pipelineResponses: unknown[][][] = [];

function pipeline() {
	const chain = {
		sadd: () => chain,
		srem: () => chain,
		set: () => chain,
		del: () => chain,
		expire: () => chain,
		scard: () => chain,
		get: () => chain,
		exists: () => chain,
		exec: () => Promise.resolve(pipelineResponses.shift() ?? []),
	};
	return chain;
}

mock.module("../../../infrastructure/queue/redis", () => ({
	redis: {
		pipeline,
		publish: publishMock,
		set: setMock,
		get: () => Promise.resolve(null),
		exists: (key: string) => Promise.resolve(key.includes(":conns:") ? 1 : 0),
		del: () => Promise.resolve(1),
		scard: () => Promise.resolve(0),
	},
}));
mock.module("../../../infrastructure/queue/pubsub", () => ({
	addToBucket: () => {},
	removeFromBucket: () => {},
	lazySubscriber: () => () => {},
}));

const { heartbeatOnline, keepsReadListenActivity, markActivity } = await import(
	"../presenceManager"
);

beforeEach(() => {
	pipelineResponses.length = 0;
	publishMock.mockClear();
	setMock.mockClear();
});

describe("presence heartbeat reconciliation", () => {
	test("keeps Read & Listen ahead of ordinary reader and player heartbeats", () => {
		const active = {
			sessionId: "session-1",
			kind: "read_listen" as const,
			book: { uuid: "ebook-1", title: "Dune" },
		};

		expect(keepsReadListenActivity(active, "reading")).toBe(true);
		expect(keepsReadListenActivity(active, "listening")).toBe(true);
		expect(keepsReadListenActivity(active, "read_listen")).toBe(false);
	});

	test("publishes online after the activity lease expires", async () => {
		pipelineResponses.push(
			[
				[null, 1],
				[null, 1],
				[null, 1],
				[null, 1],
				[null, 0],
				[null, 1],
				[null, null],
				[null, 0],
			],
			[],
			[
				[null, 0],
				[null, 1],
				[null, 1],
				[null, 1],
				[null, 0],
				[null, 1],
				[null, null],
				[null, 0],
			],
		);

		await heartbeatOnline("u1", "conn-1", "session-1", "online");
		await markActivity("u1", "session-1", "listening", {
			uuid: "audio-1",
			title: "Dune",
		});
		await heartbeatOnline("u1", "conn-1", "session-1", "online");

		expect(publishMock).toHaveBeenLastCalledWith(
			"presence:updates",
			JSON.stringify({ userId: "u1", state: "online", book: null }),
		);
	});
});
