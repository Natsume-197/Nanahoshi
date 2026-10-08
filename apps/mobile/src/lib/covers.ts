import {
	ALLOWED_DIMS,
	COVER_QUALITY,
	masterWidthFromFilename,
} from "@nanahoshi/api/lib/cover-ladder";
import { PixelRatio } from "react-native";
import { coverBucket } from "./cover-bucket";

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
	const bucket = coverBucket(Math.ceil(slotWidth * PixelRatio.get()));
	const master = masterWidthFromFilename(filename);
	const width = master ? Math.min(bucket, snapDown(master)) : bucket;
	return `${serverUrl}/api/data/covers/${encodeURIComponent(filename)}?width=${width}&quality=${COVER_QUALITY}`;
}

function snapDown(master: number) {
	let best: number = ALLOWED_DIMS[0];
	for (const dim of ALLOWED_DIMS) if (dim <= master) best = dim;
	return best;
}

/** The detail hero's blurred wash only needs a small image. */
export const HERO_BACKDROP_WIDTH = 200;

/** The detail hero's cover width, shared with the prefetch on press. */
export function heroCoverWidth(screen: number, shape: "book" | "audio") {
	return shape === "audio"
		? Math.min(screen >= 640 ? 280 : 240, screen - 96)
		: Math.min(screen >= 640 ? 240 : 200, screen - 150);
}
