import "@/test-utils/setup-dom";
import { beforeEach, describe, expect, it } from "bun:test";
import type { ReaderPosition } from "@lostcoords/lumi-reader-core";
import { getBookmark, setBookmark } from "./bookmark-store";
import { getLocalPosition, setLocalPosition } from "./position-store";

const position: ReaderPosition = {
	version: 1,
	locator: {
		spineIndex: 2,
		spineHref: "OPS/chapter.xhtml",
		atomOffset: 12,
	},
	progress: {
		globalAtomOffset: 112,
		totalAtoms: 500,
		fraction: 0.224,
	},
};

beforeEach(() => localStorage.clear());

describe("Lumi local persistence", () => {
	it("round-trips valid positions and bookmarks", () => {
		setLocalPosition("book", position);
		setBookmark("book", position);

		expect(getLocalPosition("book")).toEqual(position);
		expect(getBookmark("book")).toEqual(position);
	});

	it("ignores malformed values from storage", () => {
		localStorage.setItem(
			"nanahoshi-lumi-position:book",
			JSON.stringify({
				position: {
					version: 1,
					locator: {
						spineIndex: 0,
						spineHref: "OPS/chapter.xhtml",
						atomOffset: 0,
					},
				},
			}),
		);
		localStorage.setItem(
			"nanahoshi-lumi-bookmark:book",
			JSON.stringify({ version: 1, locator: { spineIndex: "two" } }),
		);

		expect(getLocalPosition("book")).toBeNull();
		expect(getBookmark("book")).toBeNull();
	});
});
