import { describe, expect, test } from "bun:test";
import { CollectionArtwork } from "./collection-card";

describe("CollectionArtwork", () => {
	test("renders safely when a cached API response has no preview covers", () => {
		expect(() =>
			CollectionArtwork({
				covers: undefined,
			}),
		).not.toThrow();
	});
});
