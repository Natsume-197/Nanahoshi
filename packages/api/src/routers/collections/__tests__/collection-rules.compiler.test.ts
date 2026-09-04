import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	COLLECTION_FIELD_OPERATORS,
	COLLECTION_RULE_FIELDS,
	type CollectionFieldRule,
	type DynamicCollectionDefinitionV1,
} from "../collection-rules";
import { compileDynamicCollectionQuery } from "../collection-rules.compiler";

const dialect = new PgDialect();

function render(definition: DynamicCollectionDefinitionV1) {
	return dialect.sqlToQuery(
		compileDynamicCollectionQuery(definition, {
			viewerId: "viewer-1",
			serverId: "server-1",
			accessibleLibraryIds: [4, 9],
			timeZone: "America/Bogota",
		}).where,
	);
}

describe("Dynamic Collection SQL compiler", () => {
	test("always scopes server, libraries, and hidden duplicates", () => {
		const query = render({
			version: 1,
			root: {
				kind: "group",
				match: "all",
				children: [
					{
						kind: "rule",
						field: "title",
						operator: "contains",
						value: "星の王子さま",
					},
				],
			},
			sort: [],
		});

		expect(query.sql).toContain('"library"."server_id" = $1');
		expect(query.sql).toContain('"book"."duplicate_of_book_id" is null');
		expect(query.sql).toContain('"book"."library_id" in ($2, $3)');
		expect(query.sql).not.toContain("星の王子さま");
		expect(query.params).toContain("%星の王子さま%");
	});

	test("an empty accessible scope compiles to false", () => {
		const query = dialect.sqlToQuery(
			compileDynamicCollectionQuery(
				{
					version: 1,
					root: {
						kind: "group",
						match: "all",
						children: [
							{
								kind: "rule",
								field: "liked",
								operator: "isTrue",
							},
						],
					},
					sort: [],
				},
				{
					viewerId: "viewer-1",
					serverId: "server-1",
					accessibleLibraryIds: [],
					timeZone: "UTC",
				},
			).where,
		);

		expect(query.sql).toContain("false");
	});

	test("preserves nested ALL/ANY precedence and media-specific missing guards", () => {
		const query = render({
			version: 1,
			root: {
				kind: "group",
				match: "all",
				children: [
					{
						kind: "rule",
						field: "pageCount",
						operator: "isMissing",
					},
					{
						kind: "group",
						match: "any",
						children: [
							{
								kind: "rule",
								field: "cover",
								operator: "isMissing",
							},
							{
								kind: "rule",
								field: "liked",
								operator: "isTrue",
							},
						],
					},
				],
			},
			sort: [],
		});

		expect(query.sql).toContain('"library"."media_type" = $4');
		expect(query.params).toContain("ebook");
		expect(query.sql).toContain(" or ");
		expect(query.sql).toContain('"liked_book"."book_id" is not null');
	});

	test("keeps entity labels out of SQL and uses UUIDs", () => {
		const query = render({
			version: 1,
			root: {
				kind: "group",
				match: "all",
				children: [
					{
						kind: "rule",
						field: "author",
						operator: "includesAny",
						value: [
							{
								id: "11111111-1111-4111-8111-111111111111",
								label: "Name that can change",
							},
						],
					},
				],
			},
			sort: [],
		});

		expect(query.sql).not.toContain("Name that can change");
		expect(query.params).toContain("11111111-1111-4111-8111-111111111111");
	});

	test("personal progress rules use joined state instead of per-book subqueries", () => {
		const definition: DynamicCollectionDefinitionV1 = {
			version: 1,
			root: {
				kind: "group",
				match: "all",
				children: [
					{
						kind: "rule",
						field: "consumptionStatus",
						operator: "includesAny",
						value: ["unstarted"],
					},
				],
			},
			sort: [{ field: "progressPercent", direction: "desc" }],
		};
		const query = render(definition);
		const compiled = compileDynamicCollectionQuery(definition, {
			viewerId: "viewer-1",
			serverId: "server-1",
			accessibleLibraryIds: [4, 9],
			timeZone: "America/Bogota",
		});

		expect(query.sql).toContain('"reading_progress"."status"');
		expect(query.sql).toContain('"listening_progress"."status"');
		expect(query.sql).not.toContain("FROM reading_progress rp");
		expect(query.sql).not.toContain("FROM listening_progress lp");
		expect(compiled.personalJoins).toEqual(["progress"]);
	});

	test("compiles every field in the public V1 catalog", () => {
		for (const field of COLLECTION_RULE_FIELDS) {
			const operator = COLLECTION_FIELD_OPERATORS[field][0];
			const entityFields = new Set([
				"author",
				"narrator",
				"publisher",
				"series",
				"genre",
				"tag",
				"library",
				"manualCollection",
			]);
			const enumValues: Record<string, string> = {
				mediaType: "ebook",
				language: "en",
				contentForm: "text",
				format: "epub",
				enrichmentStatus: "pending",
				shelfStatus: "want",
				consumptionStatus: "unstarted",
			};
			let value: CollectionFieldRule["value"];
			if (entityFields.has(field)) {
				value = [
					{
						id: "11111111-1111-4111-8111-111111111111",
						label: "Stable reference",
					},
				];
			} else if (enumValues[field]) {
				value = [enumValues[field]];
			} else if (["before", "after"].includes(operator)) {
				value = "2026-01-02";
			} else if (
				["isMissing", "isPresent", "isTrue", "isFalse", "isUnknown"].includes(
					operator,
				)
			) {
				value = undefined;
			} else if (
				["title", "subtitle", "filename", "isbn", "asin"].includes(field)
			) {
				value = "example";
			} else {
				value = 1;
			}

			expect(() =>
				render({
					version: 1,
					root: {
						kind: "group",
						match: "all",
						children: [
							{ kind: "rule", field, operator, value } as CollectionFieldRule,
						],
					},
					sort: [],
				}),
			).not.toThrow();
		}
	});
});
