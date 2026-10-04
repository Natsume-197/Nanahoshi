import { describe, expect, test } from "bun:test";
import {
	findReadyReadListenPairing,
	findReadyReadListenPairings,
	resolveReadListenPairingChoice,
	resolveReadListenPairState,
} from "./pairing";

describe("findReadyReadListenPairing", () => {
	test("returns the first pairing whose alignment can power the reader", () => {
		const ready = { id: "ready", alignment: { status: "ready" } };

		expect(
			findReadyReadListenPairing([
				{ id: "missing", alignment: { status: "not_imported" } },
				{ id: "stale", alignment: { status: "stale" } },
				ready,
			]),
		).toBe(ready);
	});

	test("does not offer Read & Listen without a ready alignment", () => {
		expect(
			findReadyReadListenPairing([
				{ id: "missing", alignment: { status: "not_imported" } },
				{ id: "stale", alignment: { status: "stale" } },
			]),
		).toBeUndefined();
	});

	test("preserves every ready ebook edition for an explicit choice", () => {
		const first = { id: "first", alignment: { status: "ready" } };
		const second = { id: "second", alignment: { status: "ready" } };

		expect(
			findReadyReadListenPairings([
				first,
				{ id: "stale", alignment: { status: "stale" } },
				second,
			]),
		).toEqual([first, second]);
	});

	test("requires an explicit choice when several ready editions exist", () => {
		const first = { id: "first" };
		const second = { id: "second" };

		expect(
			resolveReadListenPairingChoice([first, second], null),
		).toBeUndefined();
		expect(resolveReadListenPairingChoice([first, second], "second")).toBe(
			second,
		);
		expect(resolveReadListenPairingChoice([first], null)).toBe(first);
	});
});

describe("resolveReadListenPairState", () => {
	const pair = (alignment: string, generation?: string) => ({
		alignment: { status: alignment },
		generation: generation ? { status: generation } : null,
	});

	test("a running or queued generation wins over everything", () => {
		expect(resolveReadListenPairState(pair("ready", "running"))).toBe(
			"generating",
		);
		expect(resolveReadListenPairState(pair("not_imported", "queued"))).toBe(
			"generating",
		);
	});

	test("a usable alignment outranks a failed regeneration", () => {
		expect(resolveReadListenPairState(pair("ready", "failed"))).toBe("ready");
	});

	test("a failure only shows when nothing usable exists", () => {
		expect(resolveReadListenPairState(pair("stale", "failed"))).toBe("failed");
	});

	test("an outdated or missing alignment counts as none", () => {
		expect(resolveReadListenPairState(pair("stale"))).toBe("no_alignment");
		expect(resolveReadListenPairState(pair("not_imported", "completed"))).toBe(
			"no_alignment",
		);
	});
});
