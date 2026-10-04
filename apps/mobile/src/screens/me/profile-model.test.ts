import { describe, expect, test } from "bun:test";
import { buildRails } from "./profile-model";

const page = (ids: string[], total = ids.length) => ({
	items: ids.map((bookUuid) => ({ bookUuid })),
	total,
});

describe("buildRails", () => {
	test("merges shelves into one rail with the summed total", () => {
		const [pending] = buildRails([
			{
				key: "pending",
				label: "Pending",
				kind: "book",
				status: "all",
				pages: [page(["a", "b"], 30), page(["c"], 5)],
			},
		]);
		expect(pending?.items.map((row) => row.bookUuid)).toEqual(["a", "b", "c"]);
		expect(pending?.total).toBe(35);
	});

	test("drops empty and unloaded rails but keeps the order of the rest", () => {
		const rails = buildRails([
			{
				key: "reading",
				label: "",
				kind: "book",
				status: "reading",
				pages: [page([])],
			},
			{
				key: "listening",
				label: "",
				kind: "audiobook",
				status: "listening",
				pages: [undefined],
			},
			{
				key: "done",
				label: "",
				kind: "book",
				status: "completed",
				pages: [page(["x"])],
			},
			{
				key: "audio",
				label: "",
				kind: "audiobook",
				status: "completed",
				pages: [page(["y"])],
			},
		]);
		expect(rails.map((rail) => rail.key)).toEqual(["done", "audio"]);
	});

	test("a title on two merged shelves shows once", () => {
		const [rail] = buildRails([
			{
				key: "p",
				label: "",
				kind: "book",
				status: "all",
				pages: [page(["a"]), page(["a", "b"])],
			},
		]);
		expect(rail?.items.map((row) => row.bookUuid)).toEqual(["a", "b"]);
	});
});
