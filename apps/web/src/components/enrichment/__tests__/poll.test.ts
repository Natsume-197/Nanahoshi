import { describe, expect, test } from "bun:test";
import { ACTIVE_POLL_MS, IDLE_POLL_MS, resolvePollInterval } from "../poll";

const idle = { selectionActive: false, detailOpen: false };

describe("resolvePollInterval", () => {
	test("polls fast while books are being enriched", () => {
		expect(resolvePollInterval({ ...idle, inProgressCount: 12 })).toBe(
			ACTIVE_POLL_MS,
		);
	});

	test("falls back to the slow cadence when the tray is idle", () => {
		expect(resolvePollInterval({ ...idle, inProgressCount: 0 })).toBe(
			IDLE_POLL_MS,
		);
	});

	test("polls slowly before the first response arrives", () => {
		expect(resolvePollInterval({ ...idle, inProgressCount: undefined })).toBe(
			IDLE_POLL_MS,
		);
	});

	test("stops polling while a selection is pending", () => {
		expect(
			resolvePollInterval({
				selectionActive: true,
				detailOpen: false,
				inProgressCount: 12,
			}),
		).toBe(false);
	});

	test("stops polling while the detail pane is open", () => {
		expect(
			resolvePollInterval({
				selectionActive: false,
				detailOpen: true,
				inProgressCount: 12,
			}),
		).toBe(false);
	});

	test("stays stopped when both a selection and the detail pane are active", () => {
		expect(
			resolvePollInterval({
				selectionActive: true,
				detailOpen: true,
				inProgressCount: 12,
			}),
		).toBe(false);
	});
});
