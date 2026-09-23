import { m } from "@/paraglide/messages";

// Matcher reason codes (read-listen-matcher.ts) in words a reviewer reads.
const REASON_LABELS: {
	test: (reason: string) => boolean;
	label: () => string;
}[] = [
	{
		test: (reason) => reason.endsWith(".exact"),
		label: () => m["read_listen.reason_title_exact"](),
	},
	{
		test: (reason) => reason === "title.similar",
		label: () => m["read_listen.reason_title_similar"](),
	},
	{
		test: (reason) => reason === "author.match",
		label: () => m["read_listen.reason_author"](),
	},
	{
		test: (reason) => reason === "series.match",
		label: () => m["read_listen.reason_series"](),
	},
	{
		test: (reason) => reason === "series.position.match",
		label: () => m["read_listen.reason_series_position"](),
	},
	{
		test: (reason) => reason === "volume.match",
		label: () => m["read_listen.reason_volume"](),
	},
	{
		test: (reason) => reason === "edition.special.match",
		label: () => m["read_listen.reason_edition"](),
	},
];

export function matchReasonLabels(reasons: string[]): string[] {
	const labels = reasons.flatMap((reason) => {
		const entry = REASON_LABELS.find((candidate) => candidate.test(reason));
		return entry ? [entry.label()] : [];
	});
	return [...new Set(labels)];
}

// Audiobook providers spell languages out ("japanese"); ebooks carry codes.
const LANGUAGE_ALIASES: Record<string, string> = {
	japanese: "ja",
	english: "en",
	spanish: "es",
	chinese: "zh",
	korean: "ko",
	french: "fr",
	german: "de",
};

/** One readable language name whichever form the source used. */
export function languageName(
	value: string | null,
	locale: string,
): string | null {
	if (!value) return null;
	const code = LANGUAGE_ALIASES[value.trim().toLowerCase()] ?? value.trim();
	try {
		return (
			new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? value
		);
	} catch {
		return value;
	}
}
