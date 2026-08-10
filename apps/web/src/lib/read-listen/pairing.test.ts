import { describe, expect, test } from "bun:test";
import { findReadyReadListenPairing } from "./pairing";

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
});
