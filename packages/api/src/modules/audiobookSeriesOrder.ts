/** A tag is a number only when the whole value is numeric (not a range). */
export function parseSeriesNumber(
	value: string | null | undefined,
): number | null {
	const normalized = value?.normalize("NFKC").trim();
	if (!normalized || !/^\d+(?:\.\d+)?$/u.test(normalized)) return null;
	const number = Number(normalized);
	return Number.isFinite(number) ? number : null;
}

export function parseProviderSeriesPosition(
	value: string | null | undefined,
): number | null {
	const normalized = value?.normalize("NFKC").trim();
	const number = normalized?.match(
		/^(?:[^\d:]+シーズン\s*:\s*)?(?:(?:第|Lv\.?|Vol\.?|Book)\s*)?(\d+(?:\.\d+)?)(?:\s*巻)?$/iu,
	)?.[1];
	return parseSeriesNumber(number);
}

const SPECIAL = /番外編|短編集|外伝|\b(?:after|extra|special|side story)\b/iu;
const collator = new Intl.Collator("ja", { numeric: true });

type SeriesEntry = {
	uuid: string;
	title: string | null;
	filename: string;
	position: number | null;
	sequence?: string | null;
};

function orderKey(entry: SeriesEntry) {
	const title = (entry.title ?? entry.filename).normalize("NFKC");
	const sequence = entry.sequence?.normalize("NFKC").trim() || undefined;
	// Older memberships have no sequence. Only labeled volume brackets may
	// supply the special's anchor; an import index such as [19] may not.
	const label = sequence ?? title.match(/^\[([^\]]*巻[^\]]*)\]/u)?.[1] ?? "";
	const special = SPECIAL.test(label);
	const anchor = special
		? label.match(/^(\d+(?:\.\d+)?)(?:巻)?[・\s]/u)?.[1]
		: undefined;
	const partAnchor = label.match(
		/^(\d+(?:\.\d+)?)(?:巻)?[・,\s]+(?:part\s*\d|前編|後編|上|中|下)/iu,
	)?.[1];
	const volume =
		parseSeriesNumber(anchor ?? partAnchor) ??
		entry.position ??
		parseProviderSeriesPosition(sequence);
	// Use the last structural marker: Overlord 6 下・前編 is the first audio
	// part of volume 6, not the second part of volume 5.
	const parts = [
		...`${sequence ?? ""} ${title}`.matchAll(
			/(?:^|[\s([〈《【・])(?:(前編|後編|上|中|下)(?:巻)?)(?=$|[\s)\]〉》】・])/gu,
		),
	];
	const part = parts.at(-1)?.[1];
	const partOrder = part
		? ({ 前編: 1, 上: 1, 中: 2, 後編: 3, 下: 3 }[part] ?? 0)
		: Number(
				`${sequence ?? ""} ${title}`.match(/\bpart\.?\s*(\d+)\b/iu)?.[1] ?? 0,
			);
	return {
		volume: volume ?? Number.POSITIVE_INFINITY,
		special: Number(special),
		partOrder,
		label:
			sequence ??
			title.replace(/(?:前編|後編|上巻|中巻|下巻)/gu, "").replace(/\s+/gu, ""),
	};
}

/** All members are loaded before sorting; neither titles nor import indices define volume order. */
export function compareAudiobookSeriesEntries(
	a: SeriesEntry,
	b: SeriesEntry,
): number {
	const x = orderKey(a);
	const y = orderKey(b);
	return (
		(x.volume === y.volume ? 0 : x.volume < y.volume ? -1 : 1) ||
		x.special - y.special ||
		// Unknown numbered arcs must be compared by label before their parts.
		(!Number.isFinite(x.volume)
			? collator.compare(
					x.label.replace(/[上下]$/u, ""),
					y.label.replace(/[上下]$/u, ""),
				)
			: 0) ||
		x.partOrder - y.partOrder ||
		collator.compare(x.label, y.label) ||
		a.uuid.localeCompare(b.uuid)
	);
}
