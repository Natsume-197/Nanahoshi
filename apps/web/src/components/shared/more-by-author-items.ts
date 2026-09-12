const RESULT_LIMIT = 12;

export type MoreByAuthorCandidate = {
	uuid: string;
	title?: string | null;
	filename: string;
	cover?: string | null;
	mainColor?: string | null;
	authors: { id?: number | null; uuid?: string; name: string }[];
	seriesUuid?: string | null;
	createdAt: string;
	mediaType: "ebook" | "audiobook";
};

export function selectMoreByAuthorItems(
	candidates: MoreByAuthorCandidate[],
	currentBookUuid: string,
	currentSeriesUuid?: string | null,
): MoreByAuthorCandidate[] {
	const seen = new Set<string>();
	return candidates
		.filter(
			(item) =>
				item.uuid !== currentBookUuid &&
				(!currentSeriesUuid || item.seriesUuid !== currentSeriesUuid),
		)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.filter((item) => {
			if (seen.has(item.uuid)) return false;
			seen.add(item.uuid);
			return true;
		})
		.slice(0, RESULT_LIMIT);
}
