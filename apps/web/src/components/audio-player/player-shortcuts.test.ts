import { describe, expect, test } from "bun:test";
import { resolvePlayerShortcut } from "./player-shortcuts";

describe("resolvePlayerShortcut", () => {
	test("does not reuse a key already handled by the reader", () => {
		expect(
			resolvePlayerShortcut(
				{ key: "ArrowRight", defaultPrevented: true },
				{ isExpanded: false },
			),
		).toBeNull();
	});
});
