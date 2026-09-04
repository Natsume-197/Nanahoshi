import { describe, expect, mock, test } from "bun:test";

mock.module("@/utils/orpc", () => ({ orpc: {} }));

const { resolveCollectionPreview } = await import("./use-collection-previews");

describe("resolveCollectionPreview", () => {
	test("uses evaluated covers for dynamic collections when stored format covers are empty", () => {
		const preview = resolveCollectionPreview(
			{
				id: "dynamic-1",
				kind: "dynamic",
				previewCovers: [],
				ebookPreviewCovers: [],
				audiobookPreviewCovers: [],
			},
			{
				count: 4,
				ebookCount: 4,
				audiobookCount: 0,
				previewCovers: ["one.jpg", "two.jpg", "three.jpg", "four.jpg"],
			},
		);

		expect(preview.previewCovers).toEqual([
			"one.jpg",
			"two.jpg",
			"three.jpg",
			"four.jpg",
		]);
		expect(preview.ebookPreviewCovers).toEqual(preview.previewCovers);
		expect(preview.audiobookPreviewCovers).toEqual(preview.previewCovers);
	});
});
