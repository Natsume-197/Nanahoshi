import { describe, expect, test } from "bun:test";
import { ACTIVE_POLL_MS, IDLE_POLL_MS, resolvePollInterval } from "../poll";

describe("resolvePollInterval", () => {
	test("polls fast while books are being enriched", () => {
		expect(
			resolvePollInterval({ selectionActive: false, inProgressCount: 12 }),
		).toBe(ACTIVE_POLL_MS);
	});

	test("falls back to the slow cadence when the tray is idle", () => {
		expect(
			resolvePollInterval({ selectionActive: false, inProgressCount: 0 }),
		).toBe(IDLE_POLL_MS);
	});

	test("polls slowly before the first response arrives", () => {
		expect(
			resolvePollInterval({
				selectionActive: false,
				inProgressCount: undefined,
			}),
		).toBe(IDLE_POLL_MS);
	});

	test("stops polling while a selection is pending", () => {
		expect(
			resolvePollInterval({ selectionActive: true, inProgressCount: 12 }),
		).toBe(false);
	});
});
