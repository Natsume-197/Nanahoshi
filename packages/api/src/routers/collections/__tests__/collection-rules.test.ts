import { describe, expect, test } from "bun:test";
import {
	COLLECTION_RULE_LIMITS,
	DynamicCollectionDefinitionSchema,
	normalizeCollectionTimeZone,
	parseDynamicCollectionDefinition,
} from "../collection-rules";

const titleRule = {
	kind: "rule" as const,
	field: "title" as const,
	operator: "contains" as const,
	value: "mystery",
};

describe("Dynamic Collection definition", () => {
	test("accepts a versioned nested definition at the public parser seam", () => {
		const result = parseDynamicCollectionDefinition({
			version: 1,
			root: {
				kind: "group",
				match: "all",
				children: [
					titleRule,
					{
						kind: "group",
						match: "any",
						children: [
							{
								kind: "rule",
								field: "pageCount",
								operator: "lte",
								value: 300,
							},
							{
								kind: "rule",
								field: "durationMinutes",
								operator: "lte",
								value: 480,
							},
						],
					},
				],
			},
			sort: [
				{ field: "lastActivityAt", direction: "desc" },
				{ field: "title", direction: "asc" },
			],
		});

		expect(result.version).toBe(1);
		expect(result.root.children).toHaveLength(2);
	});

	test("rejects an empty persisted definition but permits an empty preview", () => {
		const draft = {
			version: 1,
			root: { kind: "group", match: "all", children: [] },
			sort: [],
		};

		expect(() => parseDynamicCollectionDefinition(draft)).toThrow(
			"at least one rule",
		);
		expect(
			parseDynamicCollectionDefinition(draft, { allowEmpty: true }).root
				.children,
		).toHaveLength(0);
	});

	test("rejects operators that do not belong to the selected field", () => {
		const result = DynamicCollectionDefinitionSchema.safeParse({
			version: 1,
			root: {
				kind: "group",
				match: "all",
				children: [
					{
						kind: "rule",
						field: "pageCount",
						operator: "contains",
						value: "300",
					},
				],
			},
			sort: [],
		});

		expect(result.success).toBe(false);
	});

	test("enforces tree, rule, value, and sort limits", () => {
		const tooDeep = {
			version: 1,
			root: {
				kind: "group",
				match: "all",
				children: [
					{
						kind: "group",
						match: "all",
						children: [
							{
								kind: "group",
								match: "all",
								children: [
									{
										kind: "group",
										match: "all",
										children: [titleRule],
									},
								],
							},
						],
					},
				],
			},
			sort: [],
		};
		expect(() => parseDynamicCollectionDefinition(tooDeep)).toThrow(
			`at most ${COLLECTION_RULE_LIMITS.maxDepth}`,
		);

		const repeatedRules = Array.from(
			{ length: COLLECTION_RULE_LIMITS.maxRules + 1 },
			() => titleRule,
		);
		expect(() =>
			parseDynamicCollectionDefinition({
				version: 1,
				root: { kind: "group", match: "all", children: repeatedRules },
				sort: [],
			}),
		).toThrow(`at most ${COLLECTION_RULE_LIMITS.maxRules}`);

		const tooManyRefs = Array.from(
			{ length: COLLECTION_RULE_LIMITS.maxValues + 1 },
			(_, index) => ({
				id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
				label: `Author ${index}`,
			}),
		);
		expect(() =>
			parseDynamicCollectionDefinition({
				version: 1,
				root: {
					kind: "group",
					match: "all",
					children: [
						{
							kind: "rule",
							field: "author",
							operator: "includesAny",
							value: tooManyRefs,
						},
					],
				},
				sort: [],
			}),
		).toThrow(`at most ${COLLECTION_RULE_LIMITS.maxValues}`);

		expect(() =>
			parseDynamicCollectionDefinition({
				version: 1,
				root: { kind: "group", match: "all", children: [titleRule] },
				sort: [
					{ field: "title", direction: "asc" },
					{ field: "title", direction: "desc" },
				],
			}),
		).toThrow("Duplicate sort field");
	});

	test("keeps relative calendar units and validates IANA time zones", () => {
		const parsed = parseDynamicCollectionDefinition({
			version: 1,
			root: {
				kind: "group",
				match: "all",
				children: [
					{
						kind: "rule",
						field: "addedAt",
						operator: "withinLast",
						value: { amount: 2, unit: "month" },
					},
				],
			},
			sort: [],
		});

		expect(parsed.root.children[0]).toMatchObject({
			value: { amount: 2, unit: "month" },
		});
		expect(normalizeCollectionTimeZone("America/Bogota")).toBe(
			"America/Bogota",
		);
		expect(normalizeCollectionTimeZone("Mars/Olympus")).toBe("UTC");
	});
});
