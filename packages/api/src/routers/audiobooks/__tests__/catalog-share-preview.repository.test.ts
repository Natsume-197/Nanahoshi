import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

let executeRows: Array<Record<string, unknown>> = [];
let executedQuery: SQL | null = null;
let selectRows: Array<Record<string, unknown>> = [];

const mockExecute = mock((query: SQL) => {
	executedQuery = query;
	return Promise.resolve({ rows: executeRows });
});

const mockSelect = mock(() => ({
	from: () => ({
		where: () => ({
			limit: () => Promise.resolve(selectRows),
		}),
	}),
}));

mock.module("@nanahoshi-v2/db", () => ({
	db: { execute: mockExecute, select: mockSelect },
}));

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

const { AudiobookRepository } = await import("../audiobook.repository");
const { SeriesRepository } = await import("../../series/series.repository");

const preview = {
	title: "Catalog title",
	description: "Synopsis",
	cover: "data/covers/catalog.jpg",
	authors: ["Author One"],
};

describe("catalog share-preview repositories", () => {
	beforeEach(() => {
		executeRows = [];
		selectRows = [];
		executedQuery = null;
		mockExecute.mockClear();
		mockSelect.mockClear();
	});

	test("audiobook preview exposes only the public metadata projection", async () => {
		executeRows = [preview];
		const result = await new AudiobookRepository().getSharePreview(
			"506e5ff3-e86f-56b8-8a45-736b306b17ab",
			"server-1",
		);

		expect(result).toEqual(preview);
		expect(Object.keys(result ?? {}).sort()).toEqual([
			"authors",
			"cover",
			"description",
			"title",
		]);
		const query = new PgDialect().sqlToQuery(executedQuery as SQL);
		expect(query.sql).toContain("audiobook_metadata");
		expect(query.sql).not.toContain("audio_file");
	});

	test("series preview selects the associations matching its URL type", async () => {
		executeRows = [
			{
				title: preview.title,
				description: preview.description,
				covers: [preview.cover, "data/covers/catalog-2.jpg"],
				authors: preview.authors,
			},
		];
		const repository = new SeriesRepository();

		const result = await repository.getSharePreview(
			"506e5ff3-e86f-56b8-8a45-736b306b17ab",
			"server-1",
			"audiobook",
		);
		const audiobookSql = new PgDialect().sqlToQuery(executedQuery as SQL).sql;
		expect(audiobookSql).toContain("audiobook_series");
		expect(audiobookSql).toContain("audiobook_author");
		expect(result?.cover).toBe(preview.cover);
		expect(result?.covers).toHaveLength(2);

		await repository.getSharePreview(
			"506e5ff3-e86f-56b8-8a45-736b306b17ab",
			"server-1",
			"ebook",
		);
		const ebookSql = new PgDialect().sqlToQuery(executedQuery as SQL).sql;
		expect(ebookSql).toContain("book_series");
		expect(ebookSql).toContain("book_author");
		expect(ebookSql).not.toContain("audiobook_series");
	});

	test("series server lookup returns no organization for an unknown UUID", async () => {
		const repository = new SeriesRepository();
		selectRows = [{ serverId: "server-1" }];
		expect(await repository.getServerId("series-uuid")).toBe("server-1");
		selectRows = [];
		expect(await repository.getServerId("missing")).toBeNull();
	});
});
