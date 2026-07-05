// Infers series membership from an audiobook title carrying an explicit
// volume marker — e.g. "[1巻] ひげを剃る。そして女子高生を拾う。", "Title Vol. 3",
// "Title Book 2". Bare trailing numbers are deliberately NOT treated as
// volumes ("Fahrenheit 451" is not part 451 of a series).

const FULLWIDTH_DIGITS = /[０-９]/g;

function toAsciiDigits(value: string): string {
	return value.replace(FULLWIDTH_DIGITS, (d) =>
		String.fromCharCode(d.charCodeAt(0) - 0xfee0),
	);
}

// Explicit volume markers, tried in order. Each regex captures the number.
const VOLUME_MARKERS: RegExp[] = [
	// Japanese: 第3巻 / 3巻 / [3巻] / [3巻・後編]
	/第?\s*([0-9０-９]{1,3}(?:\.[0-9０-９]+)?)\s*巻/u,
	// Western: Vol. 3 / Volume 3 / Book 3 / Part 3 / Disc 3 / CD 3
	/\b(?:vol(?:ume)?|book|part|disc|cd)\.?\s*([0-9]{1,3}(?:\.[0-9]+)?)\b/i,
	// Hash form: #3
	/#\s*([0-9]{1,3}(?:\.[0-9]+)?)\b/,
];

const OPEN_BRACKETS = "([{【〈《［";
const CLOSE_BRACKETS = ")\\]}】〉》］";

export function inferSeriesFromTitle(
	title: string | null | undefined,
): { seriesName: string; position: number | null } | null {
	if (!title) return null;

	let marker: RegExp | null = null;
	let markerText: string | null = null;
	let position: number | null = null;
	for (const pattern of VOLUME_MARKERS) {
		const match = title.match(pattern);
		if (match?.[1]) {
			marker = pattern;
			markerText = match[0];
			position = Number.parseFloat(toAsciiDigits(match[1]));
			if (!Number.isFinite(position)) position = null;
			break;
		}
	}
	// No explicit volume marker → don't guess.
	if (!marker || !markerText) return null;

	// Drop the whole bracket segment containing the marker ("[3巻・後編]" → ""),
	// or just the marker text when it isn't bracketed.
	const escaped = markerText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	let base = title.replace(
		new RegExp(
			`[${OPEN_BRACKETS}][^${CLOSE_BRACKETS}]*${escaped}[^${CLOSE_BRACKETS}]*[${CLOSE_BRACKETS}]`,
			"u",
		),
		" ",
	);
	if (base === title) base = title.replace(markerText, " ");

	// The volume number often repeats inside the remaining title, dragging a
	// per-volume subtitle behind it ("フルメタル・パニック！ 7 つづく…" →
	// "フルメタル・パニック！"). Truncate at its first standalone occurrence.
	if (position != null && Number.isInteger(position)) {
		const digits = String(position);
		const fullwidth = digits.replace(/[0-9]/g, (d) =>
			String.fromCharCode(d.charCodeAt(0) + 0xfee0),
		);
		// Lookbehind keeps the boundary char (e.g. a title's closing 。) in the
		// base. CJK letters count as a boundary too: volume numbers are glued
		// straight onto Japanese titles ("オーバーロード6").
		const standalone = new RegExp(
			`(?<=^|[\\s　${OPEN_BRACKETS}。、．,.:：・#！？-]|\\p{Script=Han}|\\p{Script=Hiragana}|\\p{Script=Katakana})[0０]*(?:${digits}|${fullwidth})(?![0-9０-９])`,
			"u",
		);
		const match = standalone.exec(base);
		if (match) {
			const truncated = base.slice(0, match.index);
			if (truncated.trim().length >= 2) base = truncated;
		}
	}

	base = base
		.replace(/[\s　]{2,}/gu, " ")
		// Orphaned counter prefixes left by truncation ("第4話" → "第")
		.replace(/[\s　]*第$/u, "")
		.replace(/[\s　]*[-–—:：・,、#][\s　]*$/u, "")
		.trim();

	// Too short to be a meaningful series name.
	if (base.length < 2) return null;

	return { seriesName: base, position };
}

// ── Common-prefix grouping ───────────────────────────────────────────────
// Light novels often title each volume "<series><per-volume subtitle>"
// (青春ブタ野郎はバニーガール先輩の夢を見ない / …プチデビル後輩の夢を見ない),
// so marker-based inference alone yields one "series" per volume. When two
// inferred names share a strong common prefix, that prefix IS the series.

// Japanese particles/copulas that shouldn't end a series name.
const TRAILING_PARTICLES = /(?:は|が|を|に|で|と|の|へ|も|より|から)[\s　]*$/u;

/** Trims separators/particles so a raw common prefix reads as a name. */
export function cleanSeriesPrefix(prefix: string): string {
	let cleaned = prefix
		.replace(/[\s　]+$/gu, "")
		.replace(/[-–—:：・,、#([{【〈《［（｛「『]+$/u, "")
		.trim();
	// Strip at most one trailing particle (青春ブタ野郎は → 青春ブタ野郎).
	cleaned = cleaned.replace(TRAILING_PARTICLES, "").trim();
	return cleaned;
}

const MIN_PREFIX_CHARS = 4;

/**
 * Common series prefix of two volume titles, or null when too weak to be
 * meaningful. CJK prefixes are dense (青春ブタ野郎 is 6 of 20 chars), so 4+
 * chars covering 30% of the shorter name suffices; Latin titles share whole
 * words by coincidence ("Dark Tower"/"Dark Matter"), so ASCII prefixes must
 * be long (12+) or cover most (60%) of the shorter name.
 */
export function commonSeriesPrefix(a: string, b: string): string | null {
	const shorter = Math.min(a.length, b.length);
	let i = 0;
	while (i < shorter && a[i] === b[i]) i++;
	if (i === 0) return null;

	const cleaned = cleanSeriesPrefix(a.slice(0, i));
	if (cleaned.length < MIN_PREFIX_CHARS) return null;

	// biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII range test
	if (/^[\x00-\x7F]+$/.test(cleaned)) {
		// Single shared words ("Dark", "Project") only count when the names are
		// outright identical; multi-word prefixes must still be substantial.
		if (a !== b) {
			if (!cleaned.includes(" ")) return null;
			if (cleaned.length < 12 && cleaned.length < shorter * 0.6) return null;
		}
	} else if (cleaned.length < shorter * 0.3) {
		return null;
	}
	return cleaned;
}
