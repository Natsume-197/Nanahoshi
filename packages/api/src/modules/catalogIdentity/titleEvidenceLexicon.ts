export type ContentEditionKind =
	| "complete"
	| "revised"
	| "expanded"
	| "new_translation";
export type SupplementKind =
	| "fanbook"
	| "short_stories"
	| "anthology"
	| "side_story"
	| "drama_cd"
	| "omnibus";

type ContentEditionEntry = {
	kind: ContentEditionKind;
	patterns: readonly string[];
};

const CONTENT_EDITIONS: readonly ContentEditionEntry[] = [
	{
		kind: "complete",
		patterns: [
			"(?<!イラスト)完全版",
			String.raw`complete\s+edition`,
			String.raw`edici[oó]n\s+completa`,
		],
	},
	{
		kind: "revised",
		patterns: [
			"改訂(?:新版)?",
			String.raw`revised\s+edition`,
			String.raw`edici[oó]n\s+revisada`,
		],
	},
	{
		kind: "expanded",
		patterns: [
			"増補(?:版)?",
			String.raw`expanded\s+edition`,
			String.raw`edici[oó]n\s+(?:ampliada|expandida)`,
		],
	},
	{
		kind: "new_translation",
		patterns: [
			"新訳",
			String.raw`new\s+translation`,
			String.raw`(?:nueva\s+traducci[oó]n|traducci[oó]n\s+nueva)`,
		],
	},
];

const SUPPLEMENTS: readonly {
	kind: SupplementKind;
	patterns: readonly string[];
}[] = [
	{
		kind: "omnibus",
		patterns: [
			String.raw`合本版|合本|全巻セット|まとめ買い|全[一二三四五六七八九十\d]+[巻冊]`,
			String.raw`omnibus|box\s*set`,
			String.raw`(?:edici[oó]n\s+)?[oó]mnibus`,
		],
	},
	{
		kind: "fanbook",
		patterns: [
			"ふぁんぶっく|ファンブック",
			String.raw`fan\s*book`,
			String.raw`libro\s+de\s+fans`,
		],
	},
	{
		kind: "short_stories",
		patterns: [
			"短編集|ショートストーリー|よりみち",
			String.raw`short\s*stor(?:y|ies)`,
			String.raw`(?:historias|relatos)\s+cort[oa]s|colecci[oó]n\s+de\s+relatos`,
		],
	},
	{
		kind: "anthology",
		patterns: ["アンソロジー", "anthology", "antolog[ií]a"],
	},
	{
		kind: "drama_cd",
		patterns: [String.raw`ドラマ\s*cd`, String.raw`drama\s*cd`],
	},
	{
		kind: "side_story",
		patterns: [
			"番外編|外伝|特別編",
			String.raw`side\s*story|(?<![a-z])ss(?![a-z])`,
			String.raw`historia\s+(?:paralela|secundaria)`,
		],
	},
];

const contentEditionMatchers = CONTENT_EDITIONS.map((entry) => ({
	kind: entry.kind,
	pattern: new RegExp(entry.patterns.join("|"), "iu"),
}));
const CONTENT_EDITION_MARKERS = new RegExp(
	CONTENT_EDITIONS.flatMap(({ patterns }) => patterns)
		.map((pattern) => `(?:${pattern})`)
		.join("|"),
	"giu",
);
const supplementMatchers = SUPPLEMENTS.map((entry) => ({
	kind: entry.kind,
	pattern: new RegExp(entry.patterns.join("|"), "iu"),
}));
const SUPPLEMENT_MARKERS = new RegExp(
	SUPPLEMENTS.flatMap(({ patterns }) => patterns)
		.map((pattern) => `(?:${pattern})`)
		.join("|"),
	"giu",
);
const LABELED_VOLUME = /\b(?:volume|volumen|vol\.?|tomo)\s*(\d+(?:\.\d+)?)/iu;
const LABELED_VOLUME_MARKERS =
	/\b(?:volume|volumen|vol\.?|tomo)\s*\d+(?:\.\d+)?\b/giu;
const NUMBERED_PART = /\b(?:part|book|parte|libro)\s*(\d+(?:\.\d+)?)/iu;
const NUMBERED_PART_MARKERS =
	/\b(?:part|book|parte|libro)\s*\d+(?:\.\d+)?\b/giu;

export type LexicalTitleEvidence = {
	labeledVolume: number | null;
	numberedPart: number | null;
	contentEdition: ContentEditionKind | null;
	supplement: SupplementKind | null;
	withoutEditionDiscriminators: string;
	withoutDiscriminators: string;
};

export function interpretLexicalTitle(title: string): LexicalTitleEvidence {
	const normalized = title.normalize("NFKC").toLowerCase();
	const volume = normalized.match(LABELED_VOLUME)?.[1];
	const part = normalized.match(NUMBERED_PART)?.[1];
	const withoutEditionDiscriminators = title
		.replace(CONTENT_EDITION_MARKERS, " ")
		.replace(LABELED_VOLUME_MARKERS, " ")
		.replace(NUMBERED_PART_MARKERS, " ");
	return {
		labeledVolume: volume ? Number.parseFloat(volume) : null,
		numberedPart: part ? Number.parseFloat(part) : null,
		contentEdition:
			contentEditionMatchers.find(({ pattern }) => pattern.test(normalized))
				?.kind ?? null,
		supplement:
			supplementMatchers.find(({ pattern }) => pattern.test(normalized))
				?.kind ?? null,
		withoutEditionDiscriminators,
		withoutDiscriminators: withoutEditionDiscriminators.replace(
			SUPPLEMENT_MARKERS,
			" ",
		),
	};
}
