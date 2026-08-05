import { describe, expect, it } from "bun:test";
import { normalizeReaderSettings } from "../settings";

describe("reader settings", () => {
	it("keeps the explicit text layout", () => {
		expect(
			normalizeReaderSettings({ textLayout: "paginated" }).textLayout,
		).toBe("paginated");
	});

	it("migrates the legacy view mode", () => {
		expect(normalizeReaderSettings({ viewMode: "continuous" }).textLayout).toBe(
			"scroll",
		);
		expect(normalizeReaderSettings({ viewMode: "paginated" }).textLayout).toBe(
			"paginated",
		);
	});
});
