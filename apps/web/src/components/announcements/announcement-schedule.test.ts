import { describe, expect, test } from "bun:test";
import {
	announcementStatus,
	fromLocalInput,
	toLocalInput,
} from "./announcement-schedule";

const now = Date.parse("2026-11-23T12:00:00Z");

describe("announcementStatus", () => {
	test("with no dates it is live", () => {
		expect(announcementStatus({ startsAt: null, endsAt: null }, now)).toBe(
			"live",
		);
	});

	test("a future start is scheduled", () => {
		expect(
			announcementStatus(
				{ startsAt: "2026-11-24T00:00:00Z", endsAt: null },
				now,
			),
		).toBe("scheduled");
	});

	test("a past end is ended, even with a future start", () => {
		expect(
			announcementStatus(
				{ startsAt: null, endsAt: "2026-11-23T11:59:00Z" },
				now,
			),
		).toBe("ended");
	});
});

describe("datetime-local round trip", () => {
	test("the instant survives being shown and read back", () => {
		const iso = "2026-12-24T18:30:00.000Z";
		expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
	});

	test("an empty field clears the date", () => {
		expect(fromLocalInput("")).toBeNull();
		expect(toLocalInput(null)).toBe("");
	});
});
