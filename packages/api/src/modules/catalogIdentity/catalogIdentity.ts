import {
	audiobookDurationSimilarity,
	audiobookMatchConfidence,
	bestAudiobookTextSimilarity,
	cleanAudiobookTitle,
} from "../audiobookMatch";
import {
	parseCatalogKanjiNumber,
	parseCatalogRomanNumber,
	stripCatalogImprintParens,
	stripCatalogSeriesTagline,
} from "../catalogTitle";
import {
	isbn10To13,
	isUsableEmbeddedUid,
	isValidAsin,
	isValidIsbn13,
	normalizeAsin,
	normalizeEmbeddedUid,
	normalizeIsbn,
} from "../identifiers";
import {
	type ContentEditionKind,
	interpretLexicalTitle,
	type SupplementKind,
} from "./titleEvidenceLexicon";
import {
	type CatalogIdentityEvidence,
	type CatalogIdentityReason,
	type CatalogIdentityVerdict,
	type CatalogTitle,
	CATALOG_IDENTITY_REASONS as R,
} from "./types";

const EMBEDDED_UID_REUSE_CAP = 8;

type TitleAnalysis = {
	value: string;
	role: CatalogTitle["role"];
	equivalentKey: string;
	base: string;
	volume: number | null;
	numberedPart: number | null;
	part: string | null;
	supplement: SupplementKind | null;
	supplementKey: string;
	supplementKeyWithoutTagline: string | null;
	contentEdition: ContentEditionKind | null;
};

type RecordAnalysis = {
	titles: TitleAnalysis[];
	internalConflict: boolean;
};

const PACKAGING_NOISE =
	/特装版|限定版|豪華版|愛蔵版|新装版|文庫版|単行本|kindle(?:限定)?|電子(?:書籍|版)|(?:店舗|購入|限定)?特典(?:あり|付き)?|paperback|hardcover|special edition|limited edition/giu;
const ILLUSTRATION_PACKAGING_PAREN = /[(（][^)）]*イラスト完全版[^)）]*[)）]/gu;
const BARE_IMPRINT_LABEL =
	/(?:^|[\s　])[\p{L}\p{M}]{1,24}(?:文庫J?|ノベルズ?|ノベルス|ブックス)(?=[\s　]|$)/giu;
const DECORATION =
	/[\s「」『』【】［\]()（）{}〈〉<>:：・。、,.!?！？~〜～'"\-−–—―─]/gu;

function unique<T>(values: T[]): T[] {
	return [...new Set(values)];
}

function titlesOf(evidence: CatalogIdentityEvidence): CatalogTitle[] {
	const titles = [...(evidence.titles ?? [])];
	if (evidence.title) titles.push({ role: "title", value: evidence.title });
	if (evidence.titleRomaji) {
		titles.push({ role: "romaji", value: evidence.titleRomaji });
	}
	const seen = new Set<string>();
	return titles.filter(({ role, value }) => {
		const trimmed = value.trim();
		const key = `${role}:${trimmed}`;
		if (!trimmed || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function cleanIdentityTitle(title: string): string {
	return stripCatalogImprintParens(title.normalize("NFKC"))
		.replace(/[「『][^」』]*[」』]シリーズ/gu, " ")
		.replace(ILLUSTRATION_PACKAGING_PAREN, " ")
		.replace(PACKAGING_NOISE, " ")
		.replace(BARE_IMPRINT_LABEL, " ")
		.replace(/[【】［］]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function repeatedTitleForms(title: string): string[] {
	const comparable = (value: string) =>
		value.normalize("NFKC").toLowerCase().replace(DECORATION, "");
	if (title.length % 2 === 0) {
		const midpoint = title.length / 2;
		if (title.slice(0, midpoint) === title.slice(midpoint)) {
			return [title.slice(0, midpoint).trim()];
		}
	}
	for (const match of title.matchAll(/[\s　]+/gu)) {
		const splitAt = match.index;
		const left = title.slice(0, splitAt).trim();
		const right = title.slice(splitAt + match[0].length).trim();
		if (!left || !right) continue;
		if (comparable(left) === comparable(right)) return [left];
		if (stripDiscriminators(left) !== stripDiscriminators(right)) continue;
		const carriesDiscriminator = (value: string) =>
			volumeNumber(value) !== null ||
			numberedPart(value) !== null ||
			partMarker(value) !== null ||
			supplementKind(value) !== null ||
			contentEditionKind(value) !== null;
		if (carriesDiscriminator(left) || carriesDiscriminator(right)) {
			return [left, right];
		}
	}
	return [title];
}

function discoveryTitle(title: string): string {
	const forms = repeatedTitleForms(cleanIdentityTitle(title));
	const retained =
		forms.find(
			(value) => volumeNumber(value) !== null || numberedPart(value) !== null,
		) ?? forms[0];
	return (
		(retained ?? title)
			// A missing typographic boundary ("Anthology1") and an explicit one
			// ("Anthology 1") are the same discovery form. This belongs to query
			// construction, not to the evidence used for the identity verdict.
			.replace(/([\p{L}\p{M}])(?=\d)/gu, "$1 ")
			.replace(/(\d)(?=[\p{L}\p{M}])/gu, "$1 ")
			.replace(/\s+/g, " ")
			.trim()
	);
}

function withDiscoveryTitles(
	evidence: CatalogIdentityEvidence,
): CatalogIdentityEvidence | null {
	let changed = false;
	const clean = (value: string | null | undefined) => {
		if (!value) return value;
		const next = discoveryTitle(value);
		if (next && next !== value) changed = true;
		return next || value;
	};
	const titles = evidence.titles?.map((title) => ({
		...title,
		value: clean(title.value) ?? title.value,
	}));
	const next = {
		...evidence,
		...(titles && { titles }),
		title: clean(evidence.title),
		titleRomaji: clean(evidence.titleRomaji),
	};
	return changed ? next : null;
}

function withSplitAuthors(
	evidence: CatalogIdentityEvidence,
): CatalogIdentityEvidence | null {
	let changed = false;
	const parts = (name: string) => {
		const split = name
			.split(/[/／]/u)
			.map((part) => part.trim())
			.filter(Boolean);
		if (split.length < 2) return [name];
		changed = true;
		return split;
	};
	const authors = evidence.authors?.flatMap<string | { name: string }>(
		(author) =>
			typeof author === "string"
				? parts(author)
				: parts(author.name).map((name) => ({ name })),
	);
	const creators = evidence.creators?.flatMap((creator) =>
		creator.role?.trim().toLowerCase() === "author"
			? parts(creator.name).map((name) => ({ ...creator, name }))
			: [creator],
	);
	return changed
		? {
				...evidence,
				...(authors && { authors }),
				...(creators && { creators }),
			}
		: null;
}

/** Raw evidence first, followed by at most three conservative search forms. */
export function buildDiscoveryProjection(
	evidence: CatalogIdentityEvidence,
): CatalogIdentityEvidence[] {
	const projected: CatalogIdentityEvidence[] = [];
	const seen = new Set<string>();
	const add = (value: CatalogIdentityEvidence | null) => {
		if (!value || projected.length >= 4) return;
		const key = JSON.stringify(value);
		if (seen.has(key)) return;
		seen.add(key);
		projected.push(value);
	};
	const titles = withDiscoveryTitles(evidence);
	const authors = withSplitAuthors(evidence);
	add(evidence);
	add(titles);
	add(authors);
	add(authors ? withDiscoveryTitles(authors) : null);
	return projected;
}

function volumeNumber(title: string): number | null {
	const cleaned = stripCatalogImprintParens(title.normalize("NFKC"))
		.replace(ILLUSTRATION_PACKAGING_PAREN, " ")
		.replace(/【[^】]*】/gu, " ")
		.replace(PACKAGING_NOISE, " ");
	const lexical = interpretLexicalTitle(cleaned);
	const normalized = lexical.withoutDiscriminators.trim();
	const marked = normalized.match(/第([一二三四五六七八九十百千]+)巻/);
	if (marked?.[1]) return parseCatalogKanjiNumber(marked[1]);
	if (lexical.labeledVolume !== null) return lexical.labeledVolume;
	if (lexical.numberedPart !== null) return null;
	const arabic = normalized.match(
		/(\d+(?:\.\d+)?)[「」『』【】[\]()（）]*\s*$/,
	);
	if (arabic?.[1]) return Number.parseFloat(arabic[1]);
	const roman = normalized.match(
		/(?<![A-Za-z])([IVXLCDM]+)[「」『』【】[\]()（）]*\s*$/,
	);
	return roman?.[1] ? parseCatalogRomanNumber(roman[1]) : null;
}

function numberedPart(title: string): number | null {
	const normalized = title.normalize("NFKC");
	const kanji = normalized.match(/第([一二三四五六七八九十百千]+)部/);
	if (kanji?.[1]) return parseCatalogKanjiNumber(kanji[1]);
	return interpretLexicalTitle(normalized).numberedPart;
}

function partMarker(title: string): string | null {
	const normalized = title.normalize("NFKC");
	return (
		normalized.match(/([前後上中下])(?:編|巻)/)?.[1] ??
		normalized.match(/[（(〈]([前後上中下])[）)〉]/)?.[1] ??
		normalized.match(/[\s　:：]([前後上中下])(?=[\s　(（]|$)/)?.[1] ??
		null
	);
}

function supplementKind(title: string): SupplementKind | null {
	return interpretLexicalTitle(title).supplement;
}

// Supplemental releases need their own title identity in addition to their
// broad kind. Strip edition numbering only after it has been compared as a
// discriminator. The typed kind remains in the key while words such as
// 雪乃side or 紅Aka retain a release's specific identity.
function supplementIdentityKey(title: string): string {
	const cleaned = stripCatalogImprintParens(title.normalize("NFKC"))
		.toLowerCase()
		.replace(/「[^」]*」シリーズ/gu, " ")
		.replace(ILLUSTRATION_PACKAGING_PAREN, " ")
		.replace(PACKAGING_NOISE, " ");
	const lexical = interpretLexicalTitle(cleaned);
	const normalized = lexical.withoutDiscriminators
		.replace(/第[一二三四五六七八九十百千]+[部巻]/gu, " ")
		.replace(/([前後上中下])(?:編|巻)/gu, " ")
		.replace(/[（(〈]([前後上中下])[）)〉]/gu, " ")
		.replace(/[\s　:：]([前後上中下])(?=[\s　(（]|$)/gu, " ")
		.replace(
			/(?:\d+(?:\.\d+)?|(?<![a-z])[ivxlcdm]+)[「」『』【】[\]()（）]*\s*$/iu,
			" ",
		)
		.replace(DECORATION, "");
	return `${lexical.supplement ?? ""}${normalized}`;
}

function supplementIdentityKeyWithoutTagline(title: string): string | null {
	const whitespaceNormalized = title.replace(/\s+/g, " ").trim();
	const withoutTagline = stripCatalogSeriesTagline(title);
	return withoutTagline === whitespaceNormalized
		? null
		: supplementIdentityKey(withoutTagline);
}

/** Query routing may avoid falling a supplement back to a main-series volume. */
export function isSupplementalCatalogTitle(title: string): boolean {
	return supplementKind(title) !== null;
}

function contentEditionKind(title: string): ContentEditionKind | null {
	return interpretLexicalTitle(title).contentEdition;
}

function stripDiscriminators(title: string): string {
	const cleaned = stripCatalogImprintParens(title.normalize("NFKC"))
		.toLowerCase()
		.replace(/「[^」]*」シリーズ/gu, " ")
		.replace(/【[^】]*】/gu, " ")
		.replace(ILLUSTRATION_PACKAGING_PAREN, " ")
		.replace(PACKAGING_NOISE, " ");
	return interpretLexicalTitle(cleaned)
		.withoutDiscriminators.replace(/第[一二三四五六七八九十百千]+[部巻]/gu, " ")
		.replace(/([前後上中下])(?:編|巻)/gu, " ")
		.replace(/[（(〈]([前後上中下])[）)〉]/gu, " ")
		.replace(/[\s　:：]([前後上中下])(?=[\s　(（]|$)/gu, " ")
		.replace(
			/(?:\d+(?:\.\d+)?|(?<![a-z])[ivxlcdm]+)[「」『』【】[\]()（）]*\s*$/iu,
			" ",
		)
		.replace(DECORATION, "");
}

function analyzeTitles(
	evidence: CatalogIdentityEvidence,
	{ expandRepeated = false }: { expandRepeated?: boolean } = {},
): RecordAnalysis {
	const titles = titlesOf(evidence).flatMap(({ role, value }) => {
		const interpreted = cleanIdentityTitle(value);
		const forms = expandRepeated
			? repeatedTitleForms(interpreted)
			: [interpreted];
		return forms.map((form) => ({
			role,
			value,
			equivalentKey: form.toLowerCase().replace(DECORATION, ""),
			base: stripDiscriminators(form),
			volume: volumeNumber(form),
			numberedPart: numberedPart(form),
			part: partMarker(form),
			supplement: supplementKind(form),
			supplementKey: supplementIdentityKey(form),
			supplementKeyWithoutTagline: supplementIdentityKeyWithoutTagline(form),
			contentEdition: contentEditionKind(form),
		}));
	});
	const hasConflict = <T>(values: (T | null)[]) =>
		unique(values.filter((value): value is T => value !== null)).length > 1;
	return {
		titles,
		internalConflict:
			hasConflict(titles.map((t) => t.volume)) ||
			hasConflict(titles.map((t) => t.numberedPart)) ||
			hasConflict(titles.map((t) => t.part)) ||
			hasConflict(titles.map((t) => t.supplement)) ||
			hasConflict(titles.map((t) => t.contentEdition)),
	};
}

function bigramDice(a: string, b: string): number {
	if (a === b) return 1;
	if (a.length < 2 || b.length < 2) return 0;
	const counts = (text: string) => {
		const out = new Map<string, number>();
		for (let i = 0; i < text.length - 1; i++) {
			const key = text.slice(i, i + 2);
			out.set(key, (out.get(key) ?? 0) + 1);
		}
		return out;
	};
	const left = counts(a);
	const right = counts(b);
	let overlap = 0;
	for (const [key, amount] of left) {
		overlap += Math.min(amount, right.get(key) ?? 0);
	}
	return (
		(2 * overlap) /
		[...left.values(), ...right.values()].reduce((a, b) => a + b, 0)
	);
}

function basesCompatible(a: string, b: string): boolean {
	if (!a || !b) return false;
	if (a === b) return true;
	const shorter = a.length <= b.length ? a : b;
	const longer = a.length > b.length ? a : b;
	if (longer.includes(shorter)) {
		return (
			shorter.length >= 10 ||
			(shorter.length >= 6 && shorter.length / longer.length >= 0.65)
		);
	}
	return shorter.length >= 8 && bigramDice(shorter, longer) >= 0.8;
}

function comparablePairs(left: TitleAnalysis[], right: TitleAnalysis[]) {
	const sameRole = left.flatMap((a) =>
		right.filter((b) => b.role === a.role).map((b) => [a, b] as const),
	);
	return sameRole.length > 0
		? sameRole
		: left.flatMap((a) => right.map((b) => [a, b] as const));
}

function explicitValue<T>(values: (T | null)[]): T | null {
	return values.find((value): value is T => value !== null) ?? null;
}

function supplementalTitlesCompatible(
	left: TitleAnalysis,
	right: TitleAnalysis,
): boolean {
	if (!left.supplementKey || !right.supplementKey) return false;
	if (left.supplementKey === right.supplementKey) return true;

	// A recurring series tagline may be present in one source and omitted in
	// another. If both sources declare taglines, retain them as distinguishing
	// title evidence instead of collapsing two explicit supplemental titles.
	if (left.supplementKeyWithoutTagline && !right.supplementKeyWithoutTagline) {
		return left.supplementKeyWithoutTagline === right.supplementKey;
	}
	if (right.supplementKeyWithoutTagline && !left.supplementKeyWithoutTagline) {
		return right.supplementKeyWithoutTagline === left.supplementKey;
	}
	return false;
}

function bookDiscriminatorVerdict(
	left: RecordAnalysis,
	right: RecordAnalysis,
): CatalogIdentityVerdict | null {
	if (left.internalConflict || right.internalConflict) {
		return {
			status: "indeterminate",
			reasons: [R.INTERNAL_DISCRIMINATOR_CONFLICT],
		};
	}
	const lv = explicitValue(left.titles.map((t) => t.volume));
	const rv = explicitValue(right.titles.map((t) => t.volume));
	if (lv !== null && rv !== null && lv !== rv) {
		return { status: "rejected", reasons: [R.VOLUME_CONFLICT] };
	}
	if (lv === null && rv !== null && rv !== 1) {
		return { status: "rejected", reasons: [R.VOLUME_CONFLICT] };
	}
	if (rv === null && lv !== null && lv !== 1) {
		return { status: "rejected", reasons: [R.VOLUME_CONFLICT] };
	}
	const lnp = explicitValue(left.titles.map((t) => t.numberedPart));
	const rnp = explicitValue(right.titles.map((t) => t.numberedPart));
	if (lnp !== null && rnp !== null && lnp !== rnp) {
		return { status: "rejected", reasons: [R.PART_CONFLICT] };
	}
	if (lnp === null && rnp !== null && rnp !== 1) {
		return { status: "rejected", reasons: [R.PART_CONFLICT] };
	}
	if (rnp === null && lnp !== null && lnp !== 1) {
		return { status: "rejected", reasons: [R.PART_CONFLICT] };
	}

	const lp = explicitValue(left.titles.map((t) => t.part));
	const rp = explicitValue(right.titles.map((t) => t.part));
	if (lp !== null && rp !== null && lp !== rp) {
		return { status: "rejected", reasons: [R.PART_CONFLICT] };
	}
	if ((lp === null) !== (rp === null)) {
		return { status: "indeterminate", reasons: [R.PART_MISSING] };
	}

	const ls = explicitValue(left.titles.map((t) => t.supplement));
	const rs = explicitValue(right.titles.map((t) => t.supplement));
	if (ls !== rs) {
		return { status: "rejected", reasons: [R.SUPPLEMENT_CONFLICT] };
	}
	if (
		ls !== null &&
		!comparablePairs(left.titles, right.titles).some(([a, b]) =>
			supplementalTitlesCompatible(a, b),
		)
	) {
		return { status: "rejected", reasons: [R.TITLE_CONFLICT] };
	}
	const le = explicitValue(left.titles.map((t) => t.contentEdition));
	const re = explicitValue(right.titles.map((t) => t.contentEdition));
	if (le !== re) {
		return { status: "rejected", reasons: [R.CONTENT_EDITION_CONFLICT] };
	}
	return null;
}

function authorNames(evidence: CatalogIdentityEvidence): string[] {
	const explicit = (evidence.authors ?? []).map((author) =>
		typeof author === "string" ? author : author.name,
	);
	const creators = (evidence.creators ?? [])
		.filter((creator) => creator.role?.trim().toLowerCase() === "author")
		.map((creator) => creator.name);
	return unique(
		[...explicit, ...creators]
			.flatMap((name) => [name, ...name.split(/[/／]/u)])
			.map((name) =>
				name.normalize("NFKC").toLowerCase().replace(DECORATION, ""),
			)
			.filter(Boolean),
	);
}

function identifiersOf(
	evidence: CatalogIdentityEvidence,
): CatalogIdentityEvidence["identifiers"] {
	const identifiers = [...(evidence.identifiers ?? [])];
	if (evidence.isbn10)
		identifiers.push({ scheme: "isbn10", value: evidence.isbn10 });
	if (evidence.isbn13)
		identifiers.push({ scheme: "isbn13", value: evidence.isbn13 });
	if (evidence.asin) identifiers.push({ scheme: "asin", value: evidence.asin });
	if (evidence.embeddedUid) {
		identifiers.push({
			scheme: "embeddedUid",
			value: evidence.embeddedUid,
			occurrenceCount: evidence.embeddedUidOccurrenceCount,
		});
	}
	return identifiers;
}

function strongIdentifierKeys(evidence: CatalogIdentityEvidence): Set<string> {
	const out = new Set<string>();
	for (const identifier of identifiersOf(evidence) ?? []) {
		if (identifier.scheme === "isbn10") {
			const isbn13 = isbn10To13(identifier.value);
			if (isbn13) out.add(`isbn:${isbn13}`);
		} else if (
			identifier.scheme === "isbn13" &&
			isValidIsbn13(identifier.value)
		) {
			out.add(`isbn:${normalizeIsbn(identifier.value)}`);
		} else if (identifier.scheme === "asin" && isValidAsin(identifier.value)) {
			out.add(`asin:${normalizeAsin(identifier.value)}`);
		} else if (identifier.scheme === "providerEdition") {
			const value = identifier.value.trim();
			if (value) out.add(`provider-edition:${value}`);
		}
	}
	return out;
}

function embeddedUidKeys(evidence: CatalogIdentityEvidence): Set<string> {
	const out = new Set<string>();
	for (const identifier of identifiersOf(evidence) ?? []) {
		if (
			identifier.scheme === "embeddedUid" &&
			isUsableEmbeddedUid(identifier.value) &&
			identifier.occurrenceCount !== undefined &&
			identifier.occurrenceCount <= EMBEDDED_UID_REUSE_CAP
		)
			out.add(normalizeEmbeddedUid(identifier.value));
	}
	return out;
}

function setsOverlap(left: Set<string>, right: Set<string>): boolean {
	return [...left].some((value) => right.has(value));
}

function languageConflict(
	left: CatalogIdentityEvidence,
	right: CatalogIdentityEvidence,
): boolean {
	const a = left.languageCode?.trim().toLowerCase().replace(/_/g, "-");
	const b = right.languageCode?.trim().toLowerCase().replace(/_/g, "-");
	return Boolean(a && b && a !== b);
}

function assessBookIdentity(
	leftEvidence: CatalogIdentityEvidence,
	rightEvidence: CatalogIdentityEvidence,
): CatalogIdentityVerdict {
	const left = analyzeTitles(leftEvidence, { expandRepeated: true });
	const right = analyzeTitles(rightEvidence, { expandRepeated: true });
	// A record with no title form declares no discriminator either. The
	// unnumbered-first-volume default reads an omitted volume off a title that
	// exists; with no title, absent evidence would masquerade as volume one and
	// veto every other volume.
	if (left.titles.length === 0 || right.titles.length === 0) {
		return { status: "indeterminate", reasons: [R.TITLE_MISSING] };
	}
	const discriminator = bookDiscriminatorVerdict(left, right);
	if (discriminator) return discriminator;
	if (languageConflict(leftEvidence, rightEvidence)) {
		return { status: "rejected", reasons: [R.LANGUAGE_CONFLICT] };
	}
	const pairs = comparablePairs(left.titles, right.titles);
	const titleMatches = pairs.some(
		([a, b]) =>
			(a.equivalentKey.length > 0 && a.equivalentKey === b.equivalentKey) ||
			basesCompatible(a.base, b.base) ||
			(a.supplement !== null &&
				a.supplement === b.supplement &&
				supplementalTitlesCompatible(a, b)),
	);
	if (!titleMatches) return { status: "rejected", reasons: [R.TITLE_CONFLICT] };
	// Compatible Title has two tiers: equivalent after normalization, or merely
	// strongly similar (the substring/bigram fallbacks, which can bridge two
	// different works). Callers need to tell them apart.
	const titleEquivalent = pairs.some(
		([a, b]) =>
			(a.equivalentKey.length > 0 && a.equivalentKey === b.equivalentKey) ||
			(a.base.length > 0 && a.base === b.base),
	);

	const leftAuthors = authorNames(leftEvidence);
	const rightAuthors = authorNames(rightEvidence);
	const authorsComparable = leftAuthors.length > 0 && rightAuthors.length > 0;
	const authorsMatch =
		authorsComparable &&
		leftAuthors.some((name) => rightAuthors.includes(name));
	const authorsConflict = authorsComparable && !authorsMatch;
	const identifierMatch = setsOverlap(
		strongIdentifierKeys(leftEvidence),
		strongIdentifierKeys(rightEvidence),
	);
	const uidMatch = setsOverlap(
		embeddedUidKeys(leftEvidence),
		embeddedUidKeys(rightEvidence),
	);

	if (authorsConflict) {
		return {
			status: identifierMatch ? "indeterminate" : "rejected",
			reasons: [
				R.TITLE_MATCH,
				R.AUTHOR_CONFLICT,
				...(identifierMatch ? [R.IDENTIFIER_MATCH] : []),
			],
		};
	}
	if (identifierMatch || uidMatch || authorsMatch) {
		const reasons: CatalogIdentityReason[] = [R.TITLE_MATCH];
		if (titleEquivalent) reasons.push(R.TITLE_EQUIVALENT);
		if (identifierMatch) reasons.push(R.IDENTIFIER_MATCH);
		if (uidMatch) reasons.push(R.EMBEDDED_UID_MATCH);
		if (authorsMatch) reasons.push(R.AUTHOR_MATCH);
		return { status: "confirmed", reasons };
	}
	return { status: "indeterminate", reasons: [R.TITLE_MATCH, R.TITLE_ONLY] };
}

function assessAudiobookIdentity(
	left: CatalogIdentityEvidence,
	right: CatalogIdentityEvidence,
): CatalogIdentityVerdict {
	const leftAsins = new Set(
		(identifiersOf(left) ?? [])
			.filter(
				(id) => id.scheme === "asin" && /^[a-z0-9]{10}$/i.test(id.value.trim()),
			)
			.map((id) => normalizeAsin(id.value)),
	);
	const rightAsins = new Set(
		(identifiersOf(right) ?? [])
			.filter(
				(id) => id.scheme === "asin" && /^[a-z0-9]{10}$/i.test(id.value.trim()),
			)
			.map((id) => normalizeAsin(id.value)),
	);
	if (setsOverlap(leftAsins, rightAsins)) {
		return { status: "confirmed", reasons: [R.AUDIO_ASIN_MATCH] };
	}
	const la = analyzeTitles(left);
	const ra = analyzeTitles(right);
	if (la.titles.length === 0 || ra.titles.length === 0) {
		return { status: "indeterminate", reasons: [R.TITLE_MISSING] };
	}
	const titlePairs = comparablePairs(la.titles, ra.titles);
	const leftAuthors = authorNames(left);
	const rightAuthors = authorNames(right);
	const confidence = audiobookMatchConfidence({
		title: Math.max(
			...titlePairs.map(([a, b]) =>
				bestAudiobookTextSimilarity(
					[cleanAudiobookTitle(a.value)],
					[cleanAudiobookTitle(b.value)],
				),
			),
		),
		duration:
			left.duration && right.duration
				? audiobookDurationSimilarity(left.duration, right.duration)
				: undefined,
		author:
			leftAuthors.length > 0 && rightAuthors.length > 0
				? bestAudiobookTextSimilarity(leftAuthors, rightAuthors)
				: undefined,
	});
	if (confidence < 0.6) {
		return { status: "rejected", reasons: [R.TITLE_CONFLICT] };
	}
	const reasons: CatalogIdentityReason[] = [R.AUDIO_TITLE_MATCH];
	if (left.duration && right.duration) {
		const gap = Math.abs(left.duration - right.duration);
		reasons.push(gap <= 60 ? R.AUDIO_DURATION_CLOSE : R.AUDIO_DURATION_FAR);
	}
	return { status: "confirmed", reasons };
}

/** Symmetric, pure identity assessment. Provider ranking is intentionally outside. */
export function assessCatalogIdentity(
	left: CatalogIdentityEvidence,
	right: CatalogIdentityEvidence,
): CatalogIdentityVerdict {
	const kind = left.kind ?? right.kind ?? "book";
	if (left.kind && right.kind && left.kind !== right.kind) {
		return { status: "rejected", reasons: [R.TITLE_CONFLICT] };
	}
	return kind === "audiobook"
		? assessAudiobookIdentity(left, right)
		: assessBookIdentity(left, right);
}

/** A bridge record cannot join two incompatible Logical Editions. */
export function assessGroupMembership(
	candidate: CatalogIdentityEvidence,
	members: readonly CatalogIdentityEvidence[],
): CatalogIdentityVerdict {
	let confirmed = false;
	// Keep the underlying reasons of the confirming matches so callers can
	// gauge match strength (e.g. title-only vs. identifier-backed) — the group
	// verdict alone would flatten that away.
	const confirmingReasons = new Set<CatalogIdentityReason>();
	for (const member of members) {
		const verdict = assessCatalogIdentity(candidate, member);
		if (verdict.status === "rejected") {
			return {
				status: "rejected",
				reasons: [R.GROUP_MEMBER_REJECTED, ...verdict.reasons],
			};
		}
		if (verdict.status === "confirmed") {
			confirmed = true;
			for (const reason of verdict.reasons) confirmingReasons.add(reason);
		}
	}
	return confirmed
		? {
				status: "confirmed",
				reasons: [R.GROUP_MEMBER_CONFIRMED, ...confirmingReasons],
			}
		: { status: "indeterminate", reasons: [R.GROUP_ALL_INDETERMINATE] };
}
