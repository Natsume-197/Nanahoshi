import { describe, expect, test } from "bun:test";
import { DynamicCollectionDefinitionSchema } from "@nanahoshi-v2/api/routers/collections/collection-rules";
import {
	DYNAMIC_COLLECTION_TEMPLATES,
	emptyDynamicCollectionDefinition,
} from "./dynamic-collection-templates";

describe("Dynamic Collection templates", () => {
	test("all shipped templates are valid persisted V1 definitions", () => {
		expect(DYNAMIC_COLLECTION_TEMPLATES).toHaveLength(13);
		for (const template of DYNAMIC_COLLECTION_TEMPLATES) {
			expect(template.id.length).toBeGreaterThan(0);
			expect(
				DynamicCollectionDefinitionSchema.safeParse(template.definition)
					.success,
			).toBe(true);
		}
	});

	test("ships examples that demonstrate nested group logic", () => {
		const groupedTemplates = DYNAMIC_COLLECTION_TEMPLATES.filter((template) =>
			template.definition.root.children.some((child) => child.kind === "group"),
		);

		expect(groupedTemplates.map((template) => template.id)).toEqual([
			"recentPicks",
			"shortBooksAnyFormat",
			"favoritesToFinish",
		]);
	});

	test("the initial editor value is deliberately incomplete", () => {
		expect(
			DynamicCollectionDefinitionSchema.safeParse(
				emptyDynamicCollectionDefinition(),
			).success,
		).toBe(false);
	});
});
