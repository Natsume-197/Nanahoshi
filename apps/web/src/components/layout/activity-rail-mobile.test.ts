import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
	new URL("./activity-rail.tsx", import.meta.url),
	"utf8",
);

describe("mobile activity rail", () => {
	it("uses the same full-screen surface and navigation hierarchy as notifications", () => {
		expect(source).toContain('className="mobile-screen-sheet inset-0');
		expect(source).toContain('overlayClassName="hidden"');
		expect(source).toContain("useOverlayBackDismiss(open && isSheet");
		expect(source).toContain('m["aria.go_back"]()');
	});

	it("closes the screen after navigating to a member or their activity", () => {
		expect(source).toContain("onNavigate={onClose}");
	});
});
