import { describe, expect, test } from "bun:test";
import { normalizeHomeLayout } from "./home-layout-store";

describe("normalizeHomeLayout", () => {
	test("adds collection discovery beside collections in saved layouts", () => {
		const layout = normalizeHomeLayout([
			{ id: "popular", visible: true },
			{ id: "your-collections", visible: false },
			{ id: "random-books", visible: true },
		]);
		const ids = layout.map((item) => item.id);

		expect(ids.indexOf("discover-collections")).toBe(
			ids.indexOf("your-collections") - 1,
		);
		expect(layout.find((item) => item.id === "your-collections")?.visible).toBe(
			false,
		);
	});
});
