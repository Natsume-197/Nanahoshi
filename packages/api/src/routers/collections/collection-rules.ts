import { z } from "zod";

export const COLLECTION_RULE_LIMITS = {
	maxDepth: 3,
	maxRules: 25,
	maxValues: 10,
	maxSorts: 3,
	maxTextLength: 200,
} as const;

export const COLLECTION_RULE_FIELDS = [
	"mediaType",
	"title",
	"subtitle",
	"filename",
	"author",
	"narrator",
	"publisher",
	"series",
	"seriesPosition",
	"genre",
	"tag",
	"language",
	"contentForm",
	"format",
	"fileSizeMb",
	"addedAt",
	"lastModifiedAt",
	"publishedDate",
	"publishedYear",
	"pageCount",
	"durationMinutes",
	"communityRating",
	"communityRatingCount",
	"cover",
	"description",
	"isbn",
	"asin",
	"explicit",
	"abridged",
	"library",
	"manualCollection",
	"enrichmentStatus",
	"metadataLocked",
	"readListenPaired",
	"liked",
	"shelfStatus",
	"consumptionStatus",
	"progressPercent",
	"startedAt",
	"completedAt",
	"lastActivityAt",
] as const;

export const COLLECTION_RULE_OPERATORS = [
	"contains",
	"notContains",
	"startsWith",
	"endsWith",
	"equals",
	"notEquals",
	"isMissing",
	"isPresent",
	"includesAny",
	"includesAll",
	"excludesAll",
	"gt",
	"gte",
	"lt",
	"lte",
	"between",
	"before",
	"after",
	"withinLast",
	"isTrue",
	"isFalse",
	"isUnknown",
] as const;

export const COLLECTION_SORT_FIELDS = [
	"title",
	"primaryAuthor",
	"series",
	"seriesPosition",
	"addedAt",
	"lastModifiedAt",
	"publishedDate",
	"publishedYear",
	"pageCount",
	"durationMinutes",
	"communityRating",
	"publisher",
	"fileSizeMb",
	"progressPercent",
	"consumptionStatus",
	"format",
	"language",
	"lastActivityAt",
	"random",
] as const;

export type CollectionRuleField = (typeof COLLECTION_RULE_FIELDS)[number];
export type CollectionRuleOperator = (typeof COLLECTION_RULE_OPERATORS)[number];
export type CollectionSortField = (typeof COLLECTION_SORT_FIELDS)[number];

export type CollectionEntityRef = { id: string; label: string };
export type CollectionRelativeDate = {
	amount: number;
	unit: "day" | "week" | "month";
};
export type CollectionRuleValue =
	| string
	| number
	| string[]
	| CollectionEntityRef[]
	| { min: number; max: number }
	| { from: string; to: string }
	| CollectionRelativeDate
	| null;

export type CollectionFieldRule = {
	kind: "rule";
	field: CollectionRuleField;
	operator: CollectionRuleOperator;
	value?: CollectionRuleValue;
};

export type CollectionRuleGroup = {
	kind: "group";
	match: "all" | "any";
	children: Array<CollectionRuleGroup | CollectionFieldRule>;
};

export type CollectionSortRule = {
	field: CollectionSortField;
	direction: "asc" | "desc";
};

export type DynamicCollectionDefinitionV1 = {
	version: 1;
	root: CollectionRuleGroup;
	sort: CollectionSortRule[];
};

const TEXT_OPERATORS = [
	"contains",
	"notContains",
	"startsWith",
	"endsWith",
	"equals",
	"notEquals",
	"isMissing",
	"isPresent",
] as const;
const PRESENCE_OPERATORS = ["isMissing", "isPresent"] as const;
const ENTITY_OPERATORS = [
	"includesAny",
	"includesAll",
	"excludesAll",
	"isMissing",
	"isPresent",
] as const;
const ENUM_OPERATORS = [
	"includesAny",
	"excludesAll",
	"isMissing",
	"isPresent",
] as const;
const NUMBER_OPERATORS = [
	"equals",
	"notEquals",
	"gt",
	"gte",
	"lt",
	"lte",
	"between",
	"isMissing",
	"isPresent",
] as const;
const DATE_OPERATORS = [
	"before",
	"after",
	"between",
	"withinLast",
	"isMissing",
	"isPresent",
] as const;
const BOOLEAN_OPERATORS = ["isTrue", "isFalse"] as const;
const TRISTATE_OPERATORS = ["isTrue", "isFalse", "isUnknown"] as const;

export const COLLECTION_FIELD_OPERATORS = {
	mediaType: ["includesAny", "excludesAll"],
	title: TEXT_OPERATORS,
	subtitle: TEXT_OPERATORS,
	filename: TEXT_OPERATORS,
	author: ENTITY_OPERATORS,
	narrator: ENTITY_OPERATORS,
	publisher: ENTITY_OPERATORS,
	series: ENTITY_OPERATORS,
	seriesPosition: NUMBER_OPERATORS,
	genre: ENTITY_OPERATORS,
	tag: ENTITY_OPERATORS,
	language: ENUM_OPERATORS,
	contentForm: ["includesAny", "excludesAll"],
	format: ["includesAny", "excludesAll"],
	fileSizeMb: NUMBER_OPERATORS,
	addedAt: ["before", "after", "between", "withinLast"],
	lastModifiedAt: DATE_OPERATORS,
	publishedDate: DATE_OPERATORS,
	publishedYear: NUMBER_OPERATORS,
	pageCount: NUMBER_OPERATORS,
	durationMinutes: NUMBER_OPERATORS,
	communityRating: NUMBER_OPERATORS,
	communityRatingCount: NUMBER_OPERATORS,
	cover: PRESENCE_OPERATORS,
	description: PRESENCE_OPERATORS,
	isbn: ["equals", "notEquals", "isMissing", "isPresent"],
	asin: ["equals", "notEquals", "isMissing", "isPresent"],
	explicit: TRISTATE_OPERATORS,
	abridged: TRISTATE_OPERATORS,
	library: ["includesAny", "excludesAll"],
	manualCollection: ENTITY_OPERATORS,
	enrichmentStatus: ["includesAny", "excludesAll"],
	metadataLocked: BOOLEAN_OPERATORS,
	readListenPaired: BOOLEAN_OPERATORS,
	liked: BOOLEAN_OPERATORS,
	shelfStatus: ["includesAny", "excludesAll"],
	consumptionStatus: ["includesAny", "excludesAll"],
	progressPercent: NUMBER_OPERATORS,
	startedAt: DATE_OPERATORS,
	completedAt: DATE_OPERATORS,
	lastActivityAt: DATE_OPERATORS,
} as const satisfies Record<
	CollectionRuleField,
	readonly CollectionRuleOperator[]
>;

export const COLLECTION_ENUM_VALUES = {
	mediaType: ["ebook", "audiobook", "readListen"],
	contentForm: ["text", "images"],
	enrichmentStatus: [
		"pending",
		"enriched",
		"partial",
		"no_match",
		"review",
		"notRun",
	],
	shelfStatus: ["want", "backlog", "inProgress", "completed", "none"],
	consumptionStatus: ["unstarted", "inProgress", "completed"],
} as const;

export const PERSONAL_COLLECTION_FIELDS = new Set<CollectionRuleField>([
	"liked",
	"shelfStatus",
	"consumptionStatus",
	"progressPercent",
	"startedAt",
	"completedAt",
	"lastActivityAt",
]);

const PERSONAL_COLLECTION_SORT_FIELDS = new Set<CollectionSortField>([
	"progressPercent",
	"consumptionStatus",
	"lastActivityAt",
]);

const EntityRefSchema = z.object({
	id: z.string().uuid(),
	label: z.string().trim().min(1).max(120),
});

const RuleValueSchema: z.ZodType<CollectionRuleValue> = z.union([
	z.string(),
	z.number(),
	z.array(z.string()),
	z.array(EntityRefSchema),
	z.object({ min: z.number(), max: z.number() }),
	z.object({ from: z.string(), to: z.string() }),
	z.object({
		amount: z.number(),
		unit: z.enum(["day", "week", "month"]),
	}),
	z.null(),
]);

const FieldRuleSchema: z.ZodType<CollectionFieldRule> = z
	.object({
		kind: z.literal("rule"),
		field: z.enum(COLLECTION_RULE_FIELDS),
		operator: z.enum(COLLECTION_RULE_OPERATORS),
		value: RuleValueSchema.optional(),
	})
	.superRefine((rule, ctx) => {
		const allowed = COLLECTION_FIELD_OPERATORS[rule.field] as readonly string[];
		if (!allowed.includes(rule.operator)) {
			ctx.addIssue({
				code: "custom",
				message: `Operator ${rule.operator} is not valid for ${rule.field}`,
				path: ["operator"],
			});
			return;
		}
		validateRuleValue(rule, ctx);
	});

const RuleGroupSchema: z.ZodType<CollectionRuleGroup> = z.lazy(() =>
	z.object({
		kind: z.literal("group"),
		match: z.enum(["all", "any"]),
		children: z.array(z.union([FieldRuleSchema, RuleGroupSchema])),
	}),
);

const SortRuleSchema = z.object({
	field: z.enum(COLLECTION_SORT_FIELDS),
	direction: z.enum(["asc", "desc"]),
});

const DefinitionShapeSchema = z.object({
	version: z.literal(1),
	root: RuleGroupSchema,
	sort: z.array(SortRuleSchema).max(COLLECTION_RULE_LIMITS.maxSorts),
});

function addValueIssue(ctx: z.RefinementCtx, message: string) {
	ctx.addIssue({ code: "custom", message, path: ["value"] });
}

function validateRuleValue(
	rule: {
		field: CollectionRuleField;
		operator: CollectionRuleOperator;
		value?: unknown;
	},
	ctx: z.RefinementCtx,
) {
	if (
		["isMissing", "isPresent", "isTrue", "isFalse", "isUnknown"].includes(
			rule.operator,
		)
	) {
		if (rule.value !== undefined && rule.value !== null) {
			addValueIssue(ctx, `${rule.operator} does not accept a value`);
		}
		return;
	}

	if (
		[
			"author",
			"narrator",
			"publisher",
			"series",
			"genre",
			"tag",
			"library",
			"manualCollection",
		].includes(rule.field)
	) {
		const result = z
			.array(EntityRefSchema)
			.min(1)
			.max(COLLECTION_RULE_LIMITS.maxValues)
			.safeParse(rule.value);
		if (!result.success) {
			addValueIssue(
				ctx,
				`Entity rules require 1 to at most ${COLLECTION_RULE_LIMITS.maxValues} references`,
			);
		}
		return;
	}

	if (
		[
			"mediaType",
			"language",
			"contentForm",
			"format",
			"enrichmentStatus",
			"shelfStatus",
			"consumptionStatus",
		].includes(rule.field)
	) {
		const result = z
			.array(z.string().trim().min(1).max(32))
			.min(1)
			.max(COLLECTION_RULE_LIMITS.maxValues)
			.safeParse(rule.value);
		if (!result.success) {
			addValueIssue(
				ctx,
				`Enum rules require 1 to at most ${COLLECTION_RULE_LIMITS.maxValues} values`,
			);
			return;
		}
		const known = COLLECTION_ENUM_VALUES[
			rule.field as keyof typeof COLLECTION_ENUM_VALUES
		] as readonly string[] | undefined;
		if (known && result.data.some((value) => !known.includes(value))) {
			addValueIssue(ctx, `Unknown value for ${rule.field}`);
		}
		return;
	}

	if (
		[
			"contains",
			"notContains",
			"startsWith",
			"endsWith",
			"equals",
			"notEquals",
		].includes(rule.operator)
	) {
		const result = z
			.string()
			.trim()
			.min(1)
			.max(COLLECTION_RULE_LIMITS.maxTextLength)
			.safeParse(rule.value);
		if (!result.success)
			addValueIssue(ctx, "A non-empty text value is required");
		return;
	}

	if (["before", "after"].includes(rule.operator)) {
		if (!isIsoDate(rule.value))
			addValueIssue(ctx, "Use an ISO date (YYYY-MM-DD)");
		return;
	}

	if (rule.operator === "withinLast") {
		const result = z
			.object({
				amount: z.number().int().min(1).max(365),
				unit: z.enum(["day", "week", "month"]),
			})
			.safeParse(rule.value);
		if (!result.success) addValueIssue(ctx, "Use a relative calendar period");
		return;
	}

	if (rule.operator === "between") {
		if (isDateField(rule.field)) {
			const result = z
				.object({ from: z.string(), to: z.string() })
				.safeParse(rule.value);
			if (
				!result.success ||
				!isIsoDate(result.data.from) ||
				!isIsoDate(result.data.to) ||
				result.data.from > result.data.to
			) {
				addValueIssue(ctx, "Date range must be ordered ISO dates");
			}
			return;
		}
		const result = z
			.object({ min: z.number().finite(), max: z.number().finite() })
			.safeParse(rule.value);
		if (!result.success || result.data.min > result.data.max) {
			addValueIssue(
				ctx,
				"Numeric range must have min less than or equal to max",
			);
		}
		return;
	}

	if (typeof rule.value !== "number" || !Number.isFinite(rule.value)) {
		addValueIssue(ctx, "A finite number is required");
	}
}

function isDateField(field: CollectionRuleField) {
	return [
		"addedAt",
		"lastModifiedAt",
		"publishedDate",
		"startedAt",
		"completedAt",
		"lastActivityAt",
	].includes(field);
}

function isIsoDate(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return (
		!Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
	);
}

function validateDefinition(
	definition: DynamicCollectionDefinitionV1,
	ctx: z.RefinementCtx,
	allowEmpty: boolean,
) {
	let ruleCount = 0;
	let deepest = 1;
	const visit = (group: CollectionRuleGroup, depth: number) => {
		deepest = Math.max(deepest, depth);
		for (const child of group.children) {
			if (child.kind === "group") visit(child, depth + 1);
			else ruleCount += 1;
		}
	};
	visit(definition.root, 1);

	if (!allowEmpty && ruleCount === 0) {
		ctx.addIssue({
			code: "custom",
			message: "A Dynamic Collection needs at least one rule",
			path: ["root"],
		});
	}
	if (deepest > COLLECTION_RULE_LIMITS.maxDepth) {
		ctx.addIssue({
			code: "custom",
			message: `Rule groups support at most ${COLLECTION_RULE_LIMITS.maxDepth} levels`,
			path: ["root"],
		});
	}
	if (ruleCount > COLLECTION_RULE_LIMITS.maxRules) {
		ctx.addIssue({
			code: "custom",
			message: `A definition supports at most ${COLLECTION_RULE_LIMITS.maxRules} rules`,
			path: ["root"],
		});
	}
	const seenSorts = new Set<CollectionSortField>();
	for (const [index, sort] of definition.sort.entries()) {
		if (seenSorts.has(sort.field)) {
			ctx.addIssue({
				code: "custom",
				message: `Duplicate sort field: ${sort.field}`,
				path: ["sort", index, "field"],
			});
		}
		seenSorts.add(sort.field);
	}
}

export const DynamicCollectionDraftSchema = DefinitionShapeSchema.superRefine(
	(definition, ctx) => validateDefinition(definition, ctx, true),
);

export const DynamicCollectionDefinitionSchema =
	DefinitionShapeSchema.superRefine((definition, ctx) =>
		validateDefinition(definition, ctx, false),
	);

export function parseDynamicCollectionDefinition(
	value: unknown,
	options: { allowEmpty?: boolean } = {},
): DynamicCollectionDefinitionV1 {
	return (
		options.allowEmpty
			? DynamicCollectionDraftSchema
			: DynamicCollectionDefinitionSchema
	).parse(value) as DynamicCollectionDefinitionV1;
}

export function isPersonalizedCollectionDefinition(
	definition: DynamicCollectionDefinitionV1,
): boolean {
	if (
		definition.sort.some((sort) =>
			PERSONAL_COLLECTION_SORT_FIELDS.has(sort.field),
		)
	) {
		return true;
	}
	const pending = [...definition.root.children];
	while (pending.length > 0) {
		const node = pending.pop();
		if (!node) continue;
		if (node.kind === "group") pending.push(...node.children);
		else if (PERSONAL_COLLECTION_FIELDS.has(node.field)) return true;
	}
	return false;
}

export function normalizeCollectionTimeZone(value?: string): string {
	if (!value) return "UTC";
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
		return value;
	} catch {
		return "UTC";
	}
}
