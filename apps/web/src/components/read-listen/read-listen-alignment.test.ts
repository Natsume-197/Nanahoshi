import { describe, expect, it } from "bun:test";
import { resolveReadListenAlignment } from "./read-listen-alignment";

describe("resolveReadListenAlignment", () => {
	it("repairs a pairing restored from cache before alignment existed", () => {
		expect(resolveReadListenAlignment(undefined)).toEqual({
			status: "not_imported",
		});
	});
});
