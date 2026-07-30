import { describe, expect, test } from "bun:test";
import { getHeaderImageSources, getHeaderPreviewUrl } from "./profile-images";

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
