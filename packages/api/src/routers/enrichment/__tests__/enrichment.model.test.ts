import { describe, expect, test } from "bun:test";
import { ListEnrichmentInput, StopEnrichmentInput } from "../enrichment.model";

describe("StopEnrichmentInput (shared target selection)", () => {
	test("accepts an explicit bulk selection", () => {
		expect(
			StopEnrichmentInput.safeParse({
				bookUuids: ["d8abf479-fc06-46c4-a853-0b5fa4fe9ef2"],
			}).success,
		).toBe(true);
	});

	test("accepts a filtered bulk selection scoped by bucket", () => {
		expect(
			StopEnrichmentInput.safeParse({
				filter: { bucket: "in_progress" },
			}).success,
		).toBe(true);
	});

	test("requires exactly one target mode", () => {
		expect(StopEnrichmentInput.safeParse({}).success).toBe(false);
		expect(
			StopEnrichmentInput.safeParse({
				bookUuids: ["d8abf479-fc06-46c4-a853-0b5fa4fe9ef2"],
				filter: {},
			}).success,
		).toBe(false);
	});
});

describe("ListEnrichmentInput", () => {
	test("defaults limit/offset and accepts a bucket filter", () => {
		const parsed = ListEnrichmentInput.parse({ bucket: "attention" });
		expect(parsed.limit).toBe(50);
		expect(parsed.offset).toBe(0);
		expect(parsed.bucket).toBe("attention");
	});

	test("rejects an unknown bucket", () => {
		expect(ListEnrichmentInput.safeParse({ bucket: "pending" }).success).toBe(
			false,
		);
	});
});
