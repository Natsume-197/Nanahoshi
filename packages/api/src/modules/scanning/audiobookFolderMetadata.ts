import { inferSeriesFromTitle } from "../audiobookSeriesInference";

// Folder metadata hints from the directory hierarchy (Audiobookshelf
// convention): folder depth relative to the library root maps to
// author/series/title. Per-case mapping is documented in extractFolderMetadata.
export type FolderMetadata = {
	authorHint: string | null;
	seriesHint: string | null;
	seriesPositionHint: number | null;
};

// ── Folder metadata extraction ──────────────────────────────────────────────

const IMPORT_DATE = /^\d{4}[-_.]\d{2}[-_.]\d{2}$/;

export function extractFolderMetadata(
	relPath: string,
	isStandalone: boolean,
	standaloneSiblingCount: number,
): FolderMetadata {
	const segments = relPath.split("/").filter(Boolean);

	if (segments.length === 0) {
		return { authorHint: null, seriesHint: null, seriesPositionHint: null };
	}

	// Last segment = the "book identifier":
	//   - For directory-grouped: folder name (= title)
	//   - For standalone .m4b: filename (title comes from file/tags)
	const bookSegment = segments[segments.length - 1] ?? "";
	const ancestors = segments
		.slice(0, -1)
		.filter((name) => !IMPORT_DATE.test(name));

	let authorHint: string | null = null;
	let seriesHint: string | null = null;

	if (isStandalone) {
		// Standalone .m4b: ancestors are the folders above the file.
		// 0 ancestors → file in root, no hints
		// 1 ancestor  → series (if siblings) or author (if alone)
		// 2+ ancestors → author (first) + series (second)
		if (ancestors.length >= 2) {
			authorHint = ancestors[0] ?? null;
			seriesHint = ancestors[1] ?? null;
		} else if (ancestors.length === 1) {
			if (standaloneSiblingCount > 1) {
				seriesHint = ancestors[0] ?? null;
			} else {
				authorHint = ancestors[0] ?? null;
			}
		}
	} else {
		// Directory-grouped: ancestors are the folders above the audiobook folder.
		// The audiobook folder itself (bookSegment) is the title.
		// 0 ancestors → 1-level: just title
		// 1 ancestor  → 2-level: author + title
		// 2+ ancestors → 3-level: author + series + title
		if (ancestors.length >= 2) {
			authorHint = ancestors[0] ?? null;
			seriesHint = ancestors[1] ?? null;
		} else if (ancestors.length === 1) {
			authorHint = ancestors[0] ?? null;
		}
	}

	// Extract series position from the book segment (filename or folder name)
	const stem = isStandalone ? bookSegment.replace(/\.[^.]+$/, "") : bookSegment;
	let seriesPositionHint = extractPositionFromName(stem);

	// For standalone files, also try the immediate parent folder name
	// (handles: Author/Series/Vol 1 - Title/file.m4b)
	if (seriesPositionHint === null && isStandalone && ancestors.length > 0) {
		seriesPositionHint = extractPositionFromName(
			ancestors[ancestors.length - 1] ?? "",
		);
	}

	return { authorHint, seriesHint, seriesPositionHint };
}

// Extracts a volume/position number from a name (filename or folder): "[1巻]",
// "Vol. 3", "Book 12", "第5巻", leading "1 -", and 上/中/下 / 前/後 positionals.
function extractPositionFromName(rawName: string): number | null {
	const name = rawName
		.normalize("NFKC")
		.replace(/\s*\[B[A-Z0-9]{9}\]\s*$/i, "")
		.trim();
	if (IMPORT_DATE.test(name)) return null;
	// Numbered patterns (checked first — more precise)
	if (/\d\s*[-–〜～~]\s*\d+(?:\.\d+)?\s*巻/u.test(name)) return null;
	const explicit = inferSeriesFromTitle(name);
	if (explicit?.position != null) return explicit.position;
	if (/^\[\d+(?:\.\d+)?\]/u.test(name)) return null;
	if (/^\[[^\]]*(?:番外編|短編集|外伝)/u.test(name)) return null;
	const numberedPatterns = [
		/第?(\d+(?:\.\d+)?)巻/,
		/\b(?:vol(?:ume)?\.?|book)\s*(\d+(?:\.\d+)?)/i,
		/^(\d+(?:\.\d+)?)\s*[-–.]\s*/, // "1 - Title"
		/\s(\d+(?:\.\d+)?)\s*$/, // "Title 2"
	];

	for (const pattern of numberedPatterns) {
		const match = name.match(pattern);
		if (match?.[1]) {
			const num = Number(match[1]);
			if (Number.isFinite(num) && num > 0) return num;
		}
	}

	// Japanese positional words (上/中/下, 前/後)
	// 上巻 (jōkan) = upper/first, 中巻 (chūkan) = middle, 下巻 (gekan) = lower/last
	// 前編 (zenpen) = first part, 後編 (kōhen) = second part
	// For 上中下 (3-part): 上=1, 中=2, 下=3
	// For 上下 (2-part): 上=1, 下=3 — gap at 2 but ordering is correct
	// For 前後 (2-part): 前=1, 後=2
	const positionalMap: [RegExp, number][] = [
		[/(?:^|[\s([])上(?:巻|$|[\s)\]])/, 1],
		[/(?:^|[\s([])中(?:巻|$|[\s)\]])/, 2],
		[/(?:^|[\s([])下(?:巻|$|[\s)\]])/, 3],
		[/前編/, 1],
		[/後編/, 2],
	];

	for (const [pattern, position] of positionalMap) {
		if (pattern.test(name)) return position;
	}

	return null;
}
