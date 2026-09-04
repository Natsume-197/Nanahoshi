import type {
	CollectionSortRule,
	DynamicCollectionDefinitionV1,
} from "@nanahoshi-v2/api/routers/collections/collection-rules";

const template = (
	id: string,
	children: DynamicCollectionDefinitionV1["root"]["children"],
	sort: CollectionSortRule[] = [{ field: "title", direction: "asc" }],
	match: DynamicCollectionDefinitionV1["root"]["match"] = "all",
) => ({
	id,
	definition: {
		version: 1 as const,
		root: { kind: "group" as const, match, children },
		sort,
	},
});

export const emptyDynamicCollectionDefinition =
	(): DynamicCollectionDefinitionV1 => ({
		version: 1,
		root: {
			kind: "group",
			match: "all",
			children: [],
		},
		sort: [{ field: "title", direction: "asc" }],
	});

export const DYNAMIC_COLLECTION_TEMPLATES = [
	template(
		"recentlyAdded",
		[
			{
				kind: "rule",
				field: "addedAt",
				operator: "withinLast",
				value: { amount: 30, unit: "day" },
			},
		],
		[{ field: "addedAt", direction: "desc" }],
	),
	template(
		"continueReading",
		[
			{
				kind: "rule",
				field: "consumptionStatus",
				operator: "includesAny",
				value: ["inProgress"],
			},
		],
		[{ field: "lastActivityAt", direction: "desc" }],
	),
	template("shortEbooks", [
		{
			kind: "rule",
			field: "mediaType",
			operator: "includesAny",
			value: ["ebook"],
		},
		{
			kind: "rule",
			field: "pageCount",
			operator: "between",
			value: { min: 1, max: 300 },
		},
		{
			kind: "rule",
			field: "consumptionStatus",
			operator: "includesAny",
			value: ["unstarted"],
		},
	]),
	template("shortAudiobooks", [
		{
			kind: "rule",
			field: "mediaType",
			operator: "includesAny",
			value: ["audiobook"],
		},
		{
			kind: "rule",
			field: "durationMinutes",
			operator: "between",
			value: { min: 1, max: 480 },
		},
		{
			kind: "rule",
			field: "consumptionStatus",
			operator: "includesAny",
			value: ["unstarted"],
		},
	]),
	template("missingCover", [
		{ kind: "rule", field: "cover", operator: "isMissing" },
	]),
	template("metadataNeedsAttention", [
		{
			kind: "rule",
			field: "enrichmentStatus",
			operator: "includesAny",
			value: ["partial", "no_match", "review"],
		},
	]),
	template("onlyEpub", [
		{ kind: "rule", field: "format", operator: "includesAny", value: ["epub"] },
	]),
	template("onlyPdf", [
		{ kind: "rule", field: "format", operator: "includesAny", value: ["pdf"] },
	]),
	template("withoutGenres", [
		{ kind: "rule", field: "genre", operator: "isMissing" },
	]),
	template(
		"inSeries",
		[{ kind: "rule", field: "series", operator: "isPresent" }],
		[
			{ field: "series", direction: "asc" },
			{ field: "seriesPosition", direction: "asc" },
		],
	),
	template(
		"recentPicks",
		[
			{
				kind: "rule",
				field: "addedAt",
				operator: "withinLast",
				value: { amount: 90, unit: "day" },
			},
			{
				kind: "group",
				match: "any",
				children: [
					{ kind: "rule", field: "liked", operator: "isTrue" },
					{
						kind: "rule",
						field: "shelfStatus",
						operator: "includesAny",
						value: ["want", "backlog"],
					},
				],
			},
		],
		[{ field: "addedAt", direction: "desc" }],
	),
	template("shortBooksAnyFormat", [
		{
			kind: "rule",
			field: "consumptionStatus",
			operator: "includesAny",
			value: ["unstarted"],
		},
		{
			kind: "group",
			match: "any",
			children: [
				{
					kind: "group",
					match: "all",
					children: [
						{
							kind: "rule",
							field: "mediaType",
							operator: "includesAny",
							value: ["ebook"],
						},
						{
							kind: "rule",
							field: "pageCount",
							operator: "between",
							value: { min: 1, max: 300 },
						},
					],
				},
				{
					kind: "group",
					match: "all",
					children: [
						{
							kind: "rule",
							field: "mediaType",
							operator: "includesAny",
							value: ["audiobook"],
						},
						{
							kind: "rule",
							field: "durationMinutes",
							operator: "between",
							value: { min: 1, max: 480 },
						},
					],
				},
			],
		},
	]),
	template("favoritesToFinish", [
		{
			kind: "rule",
			field: "consumptionStatus",
			operator: "excludesAll",
			value: ["completed"],
		},
		{
			kind: "group",
			match: "any",
			children: [
				{ kind: "rule", field: "liked", operator: "isTrue" },
				{
					kind: "rule",
					field: "shelfStatus",
					operator: "includesAny",
					value: ["inProgress", "backlog"],
				},
			],
		},
	]),
] satisfies ReadonlyArray<{
	id: string;
	definition: DynamicCollectionDefinitionV1;
}>;
