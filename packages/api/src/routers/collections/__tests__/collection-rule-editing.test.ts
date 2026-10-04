import { describe, expect, test } from "bun:test";
import {
	applyTemplate,
	defaultRule,
	isRuleComplete,
	moveChild,
	nextSortRule,
	removeChild,
	ruleInputKind,
	templateFits,
	withOperator,
} from "../collection-rule-editing";
import { emptyDynamicCollectionDefinition } from "../collection-rule-templates";
import {
	COLLECTION_ENUM_VALUES,
	type CollectionRuleGroup,
	DynamicCollectionDefinitionSchema,
	type DynamicCollectionDefinitionV1,
} from "../collection-rules";

const title = (value: string) => ({
	kind: "rule" as const,
	field: "title" as const,
	operator: "contains" as const,
	value,
});
const group = (...children: CollectionRuleGroup["children"]) =>
	({ kind: "group", match: "all", children }) satisfies CollectionRuleGroup;
const definition = (
	...children: CollectionRuleGroup["children"]
): DynamicCollectionDefinitionV1 => ({
	...emptyDynamicCollectionDefinition(),
	root: group(...children),
});

describe("rule defaults", () => {
	test("a new rule for any field starts with a value its first operator accepts", () => {
		const author = defaultRule("author");
		expect(author.operator).toBe("includesAny");
		expect(author.value).toEqual([]);
		expect(defaultRule("cover").value).toBeUndefined();
	});

	test("switching the operator resets the value to fit it", () => {
		const rule = withOperator(defaultRule("pageCount"), "between");
		expect(rule.value).toEqual({ min: 0, max: 0 });
		expect(withOperator(defaultRule("addedAt"), "between").value).toEqual({
			from: "",
			to: "",
		});
	});
});

describe("isRuleComplete", () => {
	test("text needs more than whitespace; presence checks need nothing", () => {
		expect(isRuleComplete(title("  "))).toBe(false);
		expect(isRuleComplete(title("Dune"))).toBe(true);
		expect(
			isRuleComplete(withOperator(defaultRule("cover"), "isPresent")),
		).toBe(true);
	});

	test("a date range needs both ends", () => {
		const range = withOperator(defaultRule("addedAt"), "between");
		expect(isRuleComplete(range)).toBe(false);
		expect(
			isRuleComplete({
				...range,
				value: { from: "2026-01-01", to: "2026-02-01" },
			}),
		).toBe(true);
	});
});

describe("ruleInputKind", () => {
	test("picks the editor each rule needs", () => {
		expect(
			ruleInputKind(defaultRule("author"), COLLECTION_ENUM_VALUES),
		).toEqual({ kind: "entities", field: "author" });
		expect(
			ruleInputKind(defaultRule("mediaType"), COLLECTION_ENUM_VALUES),
		).toEqual({ kind: "choices", options: COLLECTION_ENUM_VALUES.mediaType });
		expect(
			ruleInputKind(defaultRule("language"), COLLECTION_ENUM_VALUES),
		).toEqual({ kind: "list" });
		expect(
			ruleInputKind(
				withOperator(defaultRule("addedAt"), "withinLast"),
				COLLECTION_ENUM_VALUES,
			),
		).toEqual({ kind: "withinLast" });
	});
});

describe("tree edits", () => {
	test("moving swaps neighbours and ignores moves past either end", () => {
		const root = group(title("a"), title("b"));
		expect(moveChild(root, 0, 1).children).toEqual([title("b"), title("a")]);
		expect(moveChild(root, 0, -1)).toBe(root);
	});

	test("removing leaves the rest in order", () => {
		expect(removeChild(group(title("a"), title("b")), 0).children).toEqual([
			title("b"),
		]);
	});
});

describe("quick filters", () => {
	const template = definition(title("x"), title("y"));

	test("replace an empty definition, sort included", () => {
		expect(applyTemplate(emptyDynamicCollectionDefinition(), template)).toBe(
			template,
		);
	});

	test("join existing rules as one group, and the result stays valid", () => {
		const next = applyTemplate(definition(title("a")), template);
		expect(next.root.children).toEqual([
			title("a"),
			group(title("x"), title("y")),
		]);
		expect(DynamicCollectionDefinitionSchema.safeParse(next).success).toBe(
			true,
		);
	});

	test("don't fit once the rule limit would be passed", () => {
		const full = definition(...Array.from({ length: 24 }, () => title("a")));
		expect(templateFits(full, template)).toBe(false);
		expect(templateFits(full, definition(title("x")))).toBe(true);
	});
});

describe("nextSortRule", () => {
	test("offers an unused field until three sorts exist", () => {
		expect(
			nextSortRule([{ field: "title", direction: "asc" }])?.field,
		).not.toBe("title");
		expect(
			nextSortRule([
				{ field: "title", direction: "asc" },
				{ field: "series", direction: "asc" },
				{ field: "addedAt", direction: "asc" },
			]),
		).toBeNull();
	});
});
