import { describe, expect, mock, test } from "bun:test";

mock.module("@nanahoshi/env/web", () => ({
	env: { VITE_SERVER_URL: "https://api.example" },
}));

const { ALLOWED_DIMS, COVER_QUALITY, snapQuality, WARM_WIDTHS } = await import(
	"@nanahoshi/api/lib/cover-ladder"
);
const { coverPresets, getCoverUrl } = await import("./covers");

describe("coverPresets", () => {
	test("every declared width is a server resize bucket", () => {
		for (const preset of Object.values(coverPresets)) {
			for (const w of preset.widths) {
				expect(ALLOWED_DIMS as readonly number[]).toContain(w);
			}
		}
	});

	test("the blurred banner only asks for a warm rung", () => {
		for (const w of coverPresets.banner.widths) {
			expect(WARM_WIDTHS as readonly number[]).toContain(w);
		}
	});
});

test("cover URLs carry a quality the server keeps as-is", () => {
	expect(snapQuality(COVER_QUALITY)).toBe(COVER_QUALITY);
	expect(getCoverUrl("abc_w800.jpg", 400)).toBe(
		`https://api.example/api/data/covers/abc_w800.jpg?width=400&quality=${COVER_QUALITY}`,
	);
});
