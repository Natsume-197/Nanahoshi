import { describe, expect, it } from "bun:test";
import { fromDateValue, toDateValue } from "./date-value";

describe("date values", () => {
	it("round-trips the picked calendar day", () => {
		const date = fromDateValue("2026-03-08");
		expect(date?.getDate()).toBe(8);
		expect(toDateValue(date as Date)).toBe("2026-03-08");
	});

	it("keeps the local day even late at night", () => {
		expect(toDateValue(new Date(2026, 0, 31, 23, 59))).toBe("2026-01-31");
	});

	it("rejects empty and impossible dates", () => {
		expect(fromDateValue("")).toBeNull();
		expect(fromDateValue("2026-02-30")).toBeNull();
		expect(fromDateValue("next week")).toBeNull();
	});
});
