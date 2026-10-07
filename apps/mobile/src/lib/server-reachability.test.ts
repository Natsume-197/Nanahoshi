import { describe, expect, test } from "bun:test";
import {
	createServerReachability,
	isUnanswered,
	RECHECK_MS,
	serverHost,
} from "./server-reachability";

function harness(initiallyUp: boolean) {
	const server = { up: initiallyUp, probes: 0 };
	let recovered = 0;
	let now = 0;
	let timers: { at: number; run: () => void }[] = [];
	const reachability = createServerReachability({
		probe: async () => {
			server.probes++;
			return server.up;
		},
		onRecovered: () => recovered++,
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
	return { server, reachability, advance, recovered: () => recovered };
}

describe("createServerReachability", () => {
	test("a server that doesn't answer reads as unreachable, not offline", async () => {
		const { reachability } = harness(false);
		expect(await reachability.check()).toBe(false);
		expect(reachability.status()).toBe("unreachable");
	});

	test("comes back on its own when the server answers again, and reloads what failed", async () => {
		const { server, reachability, advance, recovered } = harness(false);
		await reachability.check();
		server.up = true;
		await advance(RECHECK_MS);
		expect(reachability.status()).toBe("reachable");
		expect(recovered()).toBe(1);
	});

	test("a request that got an answer clears the state without asking", async () => {
		const { server, reachability, recovered } = harness(false);
		await reachability.check();
		const probes = server.probes;
		reachability.answered();
		expect(reachability.status()).toBe("reachable");
		expect(recovered()).toBe(1);
		expect(server.probes).toBe(probes);
	});

	test("a burst of failed requests asks the server once", async () => {
		const { server, reachability } = harness(false);
		reachability.failed();
		reachability.failed();
		reachability.failed();
		await Bun.sleep(0);
		expect(server.probes).toBe(1);
	});

	test("once known gone, failing requests leave the asking to the timer", async () => {
		const { server, reachability } = harness(false);
		await reachability.check();
		const probes = server.probes;
		reachability.failed();
		reachability.failed();
		await Bun.sleep(0);
		expect(server.probes).toBe(probes);
	});

	test("stopped, it no longer asks on a timer", async () => {
		const { server, reachability, advance } = harness(false);
		await reachability.check();
		reachability.stop();
		const probes = server.probes;
		await advance(RECHECK_MS * 3);
		expect(server.probes).toBe(probes);
	});

	test("a probe that throws counts as no answer", async () => {
		const reachability = createServerReachability({
			probe: () => Promise.reject(new TypeError("Network request failed")),
			after: () => () => {},
		});
		expect(await reachability.check()).toBe(false);
		expect(reachability.status()).toBe("unreachable");
	});
});

describe("isUnanswered", () => {
	test("a fetch failure never reached the server", () => {
		expect(isUnanswered(new TypeError("Network request failed"))).toBe(true);
	});

	test("an error the server answered with is not a missing server", () => {
		expect(isUnanswered({ status: 500 })).toBe(false);
		expect(isUnanswered({ status: 403 })).toBe(false);
	});
});

test("serverHost shows the address the way people typed it", () => {
	expect(serverHost("http://192.168.1.35:7333")).toBe("192.168.1.35:7333");
	expect(serverHost("https://books.example.com")).toBe("books.example.com");
});
