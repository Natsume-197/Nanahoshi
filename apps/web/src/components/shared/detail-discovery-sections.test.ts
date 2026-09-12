import { describe, expect, test } from "bun:test";
import {
	type MoreByAuthorCandidate,
	selectMoreByAuthorItems,
} from "./more-by-author-items";

function candidate(
	uuid: string,
	createdAt: string,
	seriesUuid?: string,
): MoreByAuthorCandidate {
	return {
		uuid,
		title: uuid,
		filename: `${uuid}.epub`,
		cover: null,
		authors: [],
		seriesUuid,
		createdAt,
		mediaType: "ebook",
	};
}

describe("selectMoreByAuthorItems", () => {
	test("orders recent works and removes the current work, visible series, and duplicates", () => {
		const items = selectMoreByAuthorItems(
			[
				candidate("older", "2026-01-01T00:00:00.000Z"),
				candidate("current", "2026-05-01T00:00:00.000Z"),
				candidate("series", "2026-04-01T00:00:00.000Z", "series-1"),
				candidate("newer", "2026-03-01T00:00:00.000Z"),
				candidate("newer", "2026-02-01T00:00:00.000Z"),
			],
			"current",
			"series-1",
		);

		expect(items.map((item) => item.uuid)).toEqual(["newer", "older"]);
	});
});
