import { describe, expect, test } from "bun:test";
import {
	getHeaderImageSources,
	getHeaderPreviewUrl,
	getProfileBannerGradient,
	PROFILE_COLORS,
} from "./profile-images";

describe("profile header image sources", () => {
	test("builds a responsive pair for HD headers", () => {
		const url = "http://localhost/api/data/headers/user-123-3000w.avif";

		expect(getHeaderImageSources(url)).toEqual({
			src: url,
			srcSet:
				"http://localhost/api/data/headers/user-123-1500w.avif 1500w, http://localhost/api/data/headers/user-123-3000w.avif 3000w",
			sizes: "100vw",
		});
		expect(getHeaderPreviewUrl(url)).toBe(
			"http://localhost/api/data/headers/user-123-1500w.avif",
		);
	});

	test("still builds pairs for pre-AVIF webp headers", () => {
		const url = "http://localhost/api/data/headers/user-123-3000w.webp";

		expect(getHeaderImageSources(url)).toEqual({
			src: url,
			srcSet:
				"http://localhost/api/data/headers/user-123-1500w.webp 1500w, http://localhost/api/data/headers/user-123-3000w.webp 3000w",
			sizes: "100vw",
		});
	});

	test("keeps legacy and smaller headers unchanged", () => {
		const legacyUrl = "http://localhost/api/data/headers/user-123.webp";
		const smallUrl = "http://localhost/api/data/headers/user-123-1200w.webp";

		expect(getHeaderImageSources(legacyUrl)).toEqual({ src: legacyUrl });
		expect(getHeaderImageSources(smallUrl)).toEqual({ src: smallUrl });
		expect(getHeaderPreviewUrl(smallUrl)).toBe(smallUrl);
	});
});

describe("profile banner color", () => {
	test("builds an oklab gradient from the stored hex", () => {
		expect(getProfileBannerGradient("#5865f2")).toBe(
			"linear-gradient(135deg, #5865f2, color-mix(in oklab, #5865f2 68%, black))",
		);
	});

	test("every preset matches the server-side hex validation", () => {
		for (const color of PROFILE_COLORS) {
			expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
		}
	});
});
