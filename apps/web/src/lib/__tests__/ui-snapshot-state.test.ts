import { describe, expect, it } from "bun:test";
import { readUiSnapshot } from "../scroll-restoration";
import { commitUiSnapshotState } from "../ui-snapshot-state";

describe("commitUiSnapshotState", () => {
	it("persists a direct update synchronously", () => {
		const value = commitUiSnapshotState("history-a:sort", "name", "books");

		expect(value).toBe("books");
		expect(readUiSnapshot<string>("history-a:sort")).toBe("books");
	});

	it("resolves and persists functional updates", () => {
		const value = commitUiSnapshotState(
			"history-a:page",
			2,
			(page) => page + 1,
		);

		expect(value).toBe(3);
		expect(readUiSnapshot<number>("history-a:page")).toBe(3);
	});
});
