export interface VolumeIntent {
	/** Query with the trailing volume token stripped (or the original query). */
	text: string;
	volume: number | null;
}

function normalizeDigits(input: string): string {
	return input
		.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
		.replace(/．/g, ".");
}

// "…第3巻" / "…3巻" (no separator required before the counter)
const JP_VOLUME = /^(.*?)[\s　]*第?(\d+(?:\.\d+)?)巻$/;
// "… 3" / "… vol 3" / "… vol. 3" / "… volume 3" / "… tomo 3"
const LATIN_VOLUME =
	/^(.*?)[\s　]+(?:(?:vol\.?|volume|tomo)[\s　]*)?(\d+(?:\.\d+)?)$/i;

/**
 * Detects a trailing volume number in a search query ("konosuba 3",
 * "この素晴らしい世界に祝福を! 第3巻"). Only fires when stripping the number
 * still leaves query text — a bare number ("86", "1984") is a title, not
 * volume intent.
 */
export function parseVolumeIntent(rawQuery: string): VolumeIntent {
	const query = normalizeDigits(rawQuery.trim());
	const match = JP_VOLUME.exec(query) ?? LATIN_VOLUME.exec(query);
	if (match) {
		const text = (match[1] ?? "").trim();
		const volume = Number.parseFloat(match[2] ?? "");
		if (text && Number.isFinite(volume) && volume < 1000) {
			return { text, volume };
		}
	}
	return { text: rawQuery.trim(), volume: null };
}
