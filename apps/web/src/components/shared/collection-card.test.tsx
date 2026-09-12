import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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

describe("CollectionCard typography", () => {
	test("matches the compact BookCard title and subtitle hierarchy", () => {
		const source = readFileSync(
			new URL("./collection-card.tsx", import.meta.url),
			"utf8",
		);

		expect(source).toContain(
			'"line-clamp-2 font-medium text-base leading-snug md:text-lg"',
		);
		expect(source).toContain(
			'"line-clamp-1 text-muted-foreground text-sm leading-relaxed"',
		);
	});
});
