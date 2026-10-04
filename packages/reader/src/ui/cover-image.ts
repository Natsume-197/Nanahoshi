import {
	coverLadder,
	masterWidthFromFilename,
} from "@nanahoshi/api/lib/cover-ladder";
import { readerHost } from "../host/reader-host";

/** A cover's src/srcSet at the server's resize buckets, capped at the master. */
export function coverImage(cover: string | null | undefined, widths: number[]) {
	const filename = cover?.split("/").pop();
	if (!filename) return null;
	const master = masterWidthFromFilename(filename);
	const ladder = coverLadder(widths, master);
	const host = readerHost();
	return {
		src: host.coverUrl(filename, ladder[0] ?? widths[0] ?? 128),
		srcSet: ladder
			.map((width) => `${host.coverUrl(filename, width)} ${width}w`)
			.join(", "),
	};
}
