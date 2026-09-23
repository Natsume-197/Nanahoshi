import { describe, expect, it } from "bun:test";
import { pinRowOrder } from "./poll";

type Row = { id: string; state: string };
const keyOf = (row: Row) => row.id;

describe("pinRowOrder", () => {
	it("keeps the pinned order while rows update in place", () => {
		const live = [
			{ id: "b", state: "done" },
			{ id: "a", state: "running" },
		];
		expect(pinRowOrder(["a", "b"], live, new Map(), keyOf)).toEqual([
			{ id: "a", state: "running" },
			{ id: "b", state: "done" },
		]);
	});

	it("keeps a row that left the filter with its last known state", () => {
		const lastKnown = new Map([["a", { id: "a", state: "review" }]]);
		expect(
			pinRowOrder(["a", "b"], [{ id: "b", state: "done" }], lastKnown, keyOf),
		).toEqual([
			{ id: "a", state: "review" },
			{ id: "b", state: "done" },
		]);
	});

	it("holds new rows back until the pin is released", () => {
		const live = [
			{ id: "new", state: "running" },
			{ id: "a", state: "done" },
		];
		expect(pinRowOrder(["a"], live, new Map(), keyOf)).toEqual([
			{ id: "a", state: "done" },
		]);
	});
});
