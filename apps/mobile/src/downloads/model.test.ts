import { describe, expect, test } from "bun:test";
import {
	audioFileName,
	byteFraction,
	canDownloadTitle,
	copyInChunks,
	type DownloadEntry,
	exportFileName,
	exportMimeType,
	exportProgress,
	formatBytes,
	pickStartPosition,
	savedLocationLabel,
	sortEntries,
	weightedProgress,
} from "./model";

describe("weightedProgress", () => {
	test("finished files count whole, the current one by its fraction", () => {
		expect(weightedProgress([60, 30, 10], 1, 0.5)).toBeCloseTo(0.75);
	});

	test("files without a known duration weigh the same", () => {
		expect(weightedProgress([0, 0, 0, 0], 2, 0)).toBe(0.5);
	});

	test("all done is complete", () => {
		expect(weightedProgress([5, 5], 2, 0)).toBe(1);
	});
});

test("an unknown content length reports no progress instead of NaN", () => {
	expect(byteFraction(500, -1)).toBe(0);
	expect(byteFraction(50, 100)).toBe(0.5);
});

test("audio files are stored by index with the server's extension", () => {
	expect(audioFileName(7, "Chapter 07 - The End.MP3")).toBe("7.mp3");
	expect(audioFileName(0, "book.m4b")).toBe("0.m4b");
	expect(audioFileName(3, "no-extension")).toBe("3");
});

describe("pickStartPosition", () => {
	test("offline listening newer than the server's save resumes locally", () => {
		expect(
			pickStartPosition(
				{ time: 100, updatedAt: 1_000 },
				{ time: 900, updatedAt: 2_000 },
			),
		).toEqual({ time: 900, fromLocal: true });
	});

	test("listening on another device later wins over this phone", () => {
		expect(
			pickStartPosition(
				{ time: 1_500, updatedAt: 3_000 },
				{ time: 900, updatedAt: 2_000 },
			),
		).toEqual({ time: 1_500, fromLocal: false });
	});

	test("unreachable server falls back to this phone's position", () => {
		expect(pickStartPosition(null, { time: 42, updatedAt: 1 })).toEqual({
			time: 42,
			fromLocal: true,
		});
		expect(pickStartPosition(null, null)).toEqual({
			time: 0,
			fromLocal: false,
		});
	});
});

test("unfinished downloads list first, then the newest", () => {
	const entry = (uuid: string, complete: boolean, savedAt: number) =>
		({ uuid, complete, savedAt }) as DownloadEntry;
	const sorted = sortEntries([
		entry("old", true, 1),
		entry("partial", false, 0),
		entry("new", true, 5),
	]);
	expect(sorted.map((item) => item.uuid)).toEqual(["partial", "new", "old"]);
});

test("formatBytes", () => {
	expect(formatBytes(512, "en")).toBe("512 B");
	expect(formatBytes(3.5 * 1024 * 1024, "en")).toBe("3.5 MB");
	expect(formatBytes(1.2 * 1024 ** 3, "en")).toBe("1.2 GB");
	expect(formatBytes(250 * 1024 * 1024, "en")).toBe("250 MB");
});

test("audiobooks need the download permission, books only reading access", () => {
	const none = () => false;
	expect(canDownloadTitle("book", none)).toBe(true);
	expect(canDownloadTitle("audiobook", none)).toBe(false);
	expect(
		canDownloadTitle(
			"audiobook",
			(resource, action) => resource === "audiobook" && action === "download",
		),
	).toBe(true);
});

test("exported files keep a name the share sheet and Files app accept", () => {
	expect(exportFileName("folder/Dune: Part 1.epub", "x")).toBe(
		"Dune_ Part 1.epub",
	);
	expect(exportFileName("", "abc.zip")).toBe("abc.zip");
	expect(exportFileName("..", "abc.zip")).toBe("abc.zip");
});

test("the share sheet is told what kind of file it gets", () => {
	expect(exportMimeType("Dune.EPUB")).toBe("application/epub+zip");
	expect(exportMimeType("Dune.m4b")).toBe("audio/mp4");
	expect(exportMimeType("Series.zip")).toBe("application/zip");
	expect(exportMimeType("mystery")).toBe("application/octet-stream");
});

test("a ZIP without a length still moves the bar, by the audiobook's size", () => {
	expect(exportProgress(50, 100, 0)).toBe(0.5);
	expect(exportProgress(250, -1, 1_000)).toBe(0.25);
	// A slightly bigger ZIP doesn't show done before it is.
	expect(exportProgress(1_010, -1, 1_000)).toBe(0.99);
	expect(exportProgress(10, -1, 0)).toBe(0);
});

test("the saved note says where the file went, when Android tells us", () => {
	expect(
		savedLocationLabel(
			"content://com.android.externalstorage.documents/document/primary%3ADownload%2FDune.epub",
		),
	).toBe("Download/Dune.epub");
	expect(
		savedLocationLabel(
			"content://com.android.externalstorage.documents/document/1234-ABCD%3ABooks%2FDune.epub",
		),
	).toBe("Books/Dune.epub");
	// A file created inside a picked folder carries the tree before it.
	expect(
		savedLocationLabel(
			"content://com.android.externalstorage.documents/tree/primary%3ADownload%2FNanahoshi/document/primary%3ADownload%2FNanahoshi%2FDune.epub",
		),
	).toBe("Download/Nanahoshi/Dune.epub");
	// The Downloads app and cloud providers hand back opaque ids.
	expect(
		savedLocationLabel(
			"content://com.android.providers.downloads.documents/document/msf%3A1042",
		),
	).toBeNull();
});

test("saving copies every byte in chunks and reports how far it got", async () => {
	const source = Uint8Array.from({ length: 10 }, (_, index) => index);
	let cursor = 0;
	const written: number[] = [];
	const progress: number[] = [];
	const copied = await copyInChunks({
		read: (length) => {
			const chunk = source.slice(cursor, cursor + length);
			cursor += chunk.length;
			return chunk;
		},
		write: (bytes) => written.push(...bytes),
		total: source.length,
		chunkSize: 4,
		onProgress: (fraction) => progress.push(fraction),
		yieldToUi: async () => {},
	});
	expect(copied).toBe(10);
	expect(written).toEqual([...source]);
	expect(progress).toEqual([0.4, 0.8, 1]);
});

test("a source that runs short stops the copy instead of looping", async () => {
	const copied = await copyInChunks({
		read: () => new Uint8Array(0),
		write: () => {
			throw new Error("nothing to write");
		},
		total: 100,
		yieldToUi: async () => {},
	});
	expect(copied).toBe(0);
});
