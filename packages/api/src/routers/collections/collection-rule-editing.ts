import {
	COLLECTION_FIELD_OPERATORS,
	COLLECTION_RULE_LIMITS,
	COLLECTION_SORT_FIELDS,
	type CollectionFieldRule,
	type CollectionRuleField,
	type CollectionRuleGroup,
	type CollectionRuleOperator,
	type CollectionRuleValue,
	type CollectionSortRule,
	type DynamicCollectionDefinitionV1,
} from "./collection-rules";

// Editing helpers shared by the web and mobile rule editors: what kind of
// input a rule needs, its defaults, and immutable edits of the rule tree.

export const PRESENCE_OPERATORS = new Set<CollectionRuleOperator>([
	"isMissing",
	"isPresent",
	"isTrue",
	"isFalse",
	"isUnknown",
]);

export const ENTITY_FIELDS = new Set<CollectionRuleField>([
	"author",
	"narrator",
	"publisher",
	"series",
	"genre",
	"tag",
	"library",
	"manualCollection",
]);

export type EntityField =
	| "author"
	| "narrator"
	| "publisher"
	| "series"
	| "genre"
	| "tag"
	| "library"
	| "manualCollection";

export const DATE_FIELDS = new Set<CollectionRuleField>([
	"addedAt",
	"lastModifiedAt",
	"publishedDate",
	"startedAt",
	"completedAt",
	"lastActivityAt",
]);

export const NUMBER_FIELDS = new Set<CollectionRuleField>([
	"seriesPosition",
	"fileSizeMb",
	"publishedYear",
	"pageCount",
	"durationMinutes",
	"communityRating",
	"communityRatingCount",
	"progressPercent",
]);

const LIST_OPERATORS = new Set<CollectionRuleOperator>([
	"includesAny",
	"includesAll",
	"excludesAll",
]);

export type RuleChild = CollectionRuleGroup | CollectionFieldRule;

/** What the value editor of a rule shows. */
export type RuleInputKind =
	| { kind: "none" }
	| { kind: "range"; date: boolean }
	| { kind: "withinLast" }
	| { kind: "entities"; field: EntityField }
	| { kind: "choices"; options: readonly string[] }
	| { kind: "list" }
	| { kind: "date" }
	| { kind: "number" }
	| { kind: "text" };

export function ruleInputKind(
	rule: Pick<CollectionFieldRule, "field" | "operator">,
	enumValues: Partial<Record<CollectionRuleField, readonly string[]>>,
): RuleInputKind {
	if (PRESENCE_OPERATORS.has(rule.operator)) return { kind: "none" };
	if (rule.operator === "between") {
		return { kind: "range", date: DATE_FIELDS.has(rule.field) };
	}
	if (rule.operator === "withinLast") return { kind: "withinLast" };
	if (ENTITY_FIELDS.has(rule.field)) {
		return { kind: "entities", field: rule.field as EntityField };
	}
	if (LIST_OPERATORS.has(rule.operator)) {
		const options = enumValues[rule.field];
		return options ? { kind: "choices", options } : { kind: "list" };
	}
	if (DATE_FIELDS.has(rule.field)) return { kind: "date" };
	if (NUMBER_FIELDS.has(rule.field)) return { kind: "number" };
	return { kind: "text" };
}

export function countRules(group: CollectionRuleGroup): number {
	return group.children.reduce(
		(total, child) => total + (child.kind === "group" ? countRules(child) : 1),
		0,
	);
}

export function defaultValue(
	field: CollectionRuleField,
	operator: CollectionRuleOperator,
): CollectionRuleValue | undefined {
	if (PRESENCE_OPERATORS.has(operator)) return undefined;
	if (operator === "between")
		return DATE_FIELDS.has(field) ? { from: "", to: "" } : { min: 0, max: 0 };
	if (operator === "withinLast") return { amount: 30, unit: "day" };
	if (ENTITY_FIELDS.has(field)) return [];
	if (LIST_OPERATORS.has(operator)) return [];
	if (NUMBER_FIELDS.has(field)) return 0;
	return "";
}

export function defaultRule(
	field: CollectionRuleField = "title",
): CollectionFieldRule {
	const operator = COLLECTION_FIELD_OPERATORS[
		field
	][0] as CollectionRuleOperator;
	return {
		kind: "rule",
		field,
		operator,
		value: defaultValue(field, operator),
	};
}

/** A new operator keeps the field and resets the value to fit. */
export function withOperator(
	rule: CollectionFieldRule,
	operator: CollectionRuleOperator,
): CollectionFieldRule {
	return { ...rule, operator, value: defaultValue(rule.field, operator) };
}

export function isRuleComplete(rule: CollectionFieldRule): boolean {
	if (PRESENCE_OPERATORS.has(rule.operator)) return true;
	if (rule.operator === "between") {
		if (
			!rule.value ||
			typeof rule.value !== "object" ||
			Array.isArray(rule.value)
		)
			return false;
		if (DATE_FIELDS.has(rule.field)) {
			return (
				"from" in rule.value &&
				"to" in rule.value &&
				Boolean(rule.value.from) &&
				Boolean(rule.value.to)
			);
		}
		return (
			"min" in rule.value &&
			"max" in rule.value &&
			Number.isFinite(rule.value.min) &&
			Number.isFinite(rule.value.max)
		);
	}
	if (rule.operator === "withinLast") {
		return Boolean(
			rule.value &&
				typeof rule.value === "object" &&
				!Array.isArray(rule.value) &&
				"amount" in rule.value &&
				rule.value.amount > 0,
		);
	}
	if (Array.isArray(rule.value)) return rule.value.length > 0;
	if (typeof rule.value === "string") return rule.value.trim().length > 0;
	return typeof rule.value === "number" && Number.isFinite(rule.value);
}

export function replaceChild(
	group: CollectionRuleGroup,
	index: number,
	child: RuleChild,
): CollectionRuleGroup {
	return {
		...group,
		children: group.children.map((current, i) =>
			i === index ? child : current,
		),
	};
}

export function removeChild(
	group: CollectionRuleGroup,
	index: number,
): CollectionRuleGroup {
	return { ...group, children: group.children.filter((_, i) => i !== index) };
}

/** Swaps a child with its neighbour; out-of-range moves change nothing. */
export function moveChild(
	group: CollectionRuleGroup,
	index: number,
	direction: -1 | 1,
): CollectionRuleGroup {
	const target = index + direction;
	if (target < 0 || target >= group.children.length) return group;
	const children = [...group.children];
	[children[index], children[target]] = [
		children[target] as RuleChild,
		children[index] as RuleChild,
	];
	return { ...group, children };
}

export function appendChild(
	group: CollectionRuleGroup,
	child: RuleChild,
): CollectionRuleGroup {
	return { ...group, children: [...group.children, child] };
}

export const emptyGroup = (): CollectionRuleGroup => ({
	kind: "group",
	match: "all",
	children: [],
});

/**
 * A quick filter replaces an empty definition outright; otherwise its rules
 * join the existing ones (several of them as one "all" group).
 */
export function applyTemplate(
	definition: DynamicCollectionDefinitionV1,
	template: DynamicCollectionDefinitionV1,
): DynamicCollectionDefinitionV1 {
	if (definition.root.children.length === 0) return template;
	const additions = template.root.children;
	const child: RuleChild =
		additions.length === 1
			? (additions[0] as RuleChild)
			: { kind: "group", match: "all", children: additions };
	return { ...definition, root: appendChild(definition.root, child) };
}

export function templateFits(
	definition: DynamicCollectionDefinitionV1,
	template: DynamicCollectionDefinitionV1,
): boolean {
	const existing =
		definition.root.children.length === 0 ? 0 : countRules(definition.root);
	return (
		existing + countRules(template.root) <= COLLECTION_RULE_LIMITS.maxRules
	);
}

/** The next sort field not already used, or null at the limit. */
export function nextSortRule(
	sort: CollectionSortRule[],
): CollectionSortRule | null {
	if (sort.length >= COLLECTION_RULE_LIMITS.maxSorts) return null;
	const field = COLLECTION_SORT_FIELDS.find(
		(candidate) => !sort.some((item) => item.field === candidate),
	);
	return field ? { field, direction: "asc" } : null;
}
