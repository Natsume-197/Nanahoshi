import {
	ALLOWED_DIMS,
	COVER_QUALITY,
	masterWidthFromFilename,
} from "@nanahoshi/api/lib/cover-ladder";
import { PixelRatio } from "react-native";

/**
 * Covers are served (unauthenticated) from the server's resize cache, which
 * only answers the widths in ALLOWED_DIMS. Ask for the bucket that covers the
 * slot at this screen's density, never more than the stored master holds —
 * past that the server returns the same bytes under a different URL.
 */
export function coverUrl(
	serverUrl: string,
	cover: string | null | undefined,
	slotWidth: number,
): string | null {
	if (!cover) return null;
	const filename = cover.split("/").pop();
	if (!filename) return null;
	const wanted = Math.ceil(slotWidth * PixelRatio.get());
	const bucket =
		ALLOWED_DIMS.find((dim) => dim >= wanted) ??
		ALLOWED_DIMS[ALLOWED_DIMS.length - 1];
	const master = masterWidthFromFilename(filename);
	const width = master ? Math.min(bucket, snapDown(master)) : bucket;
	return `${serverUrl}/api/data/covers/${encodeURIComponent(filename)}?width=${width}&quality=${COVER_QUALITY}`;
}

function snapDown(master: number) {
	let best: number = ALLOWED_DIMS[0];
	for (const dim of ALLOWED_DIMS) if (dim <= master) best = dim;
	return best;
}
