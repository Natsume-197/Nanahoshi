import { describe, expect, mock, test } from "bun:test";

const published: { channel: string; message: string }[] = [];
mock.module("../../infrastructure/queue/redis", () => ({
	redis: {
		options: {},
		publish: async (channel: string, message: string) => {
			published.push({ channel, message });
			return 1;
		},
	},
}));

const { publishTrayChanged, TRAY_COALESCE_MS } = await import("./tray.events");
const settle = () =>
	new Promise((resolve) => setTimeout(resolve, TRAY_COALESCE_MS + 50));

describe("publishTrayChanged", () => {
	test("coalesces a burst into one push per server and kind", async () => {
		published.length = 0;
		for (let i = 0; i < 20; i++) publishTrayChanged("server-a", "metadata");
		publishTrayChanged("server-a", "pairings");
		publishTrayChanged("server-b", "metadata");
		expect(published).toHaveLength(0);
		await settle();
		expect(published.map(({ message }) => JSON.parse(message))).toEqual([
			{ serverId: "server-a", event: { kind: "metadata" } },
			{ serverId: "server-a", event: { kind: "pairings" } },
			{ serverId: "server-b", event: { kind: "metadata" } },
		]);
	});

	test("sends again after the window closes", async () => {
		published.length = 0;
		publishTrayChanged("server-a", "metadata");
		await settle();
		publishTrayChanged("server-a", "metadata");
		await settle();
		expect(published).toHaveLength(2);
	});

	test("ignores books without a server", async () => {
		published.length = 0;
		publishTrayChanged(null, "metadata");
		await settle();
		expect(published).toHaveLength(0);
	});
});
