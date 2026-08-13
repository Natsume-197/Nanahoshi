import { describe, expect, test } from "bun:test";
import {
	findReadyReadListenPairing,
	findReadyReadListenPairings,
	resolveReadListenPairingChoice,
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
