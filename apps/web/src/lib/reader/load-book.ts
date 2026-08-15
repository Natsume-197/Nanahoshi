import { ebookSourceFormatForFilename } from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import { readBlobWithProgress } from "@/lib/reader/fetch-with-progress";
import { loadEbook } from "@/lib/reader/load-ebook";
import type { ReaderBookData, ReaderSourceFormat } from "@/lib/reader/types";
import { client } from "@/utils/orpc";

export interface LoadBookCallbacks {
	/** 0–1, or undefined while the size is unknown. */
	onDownloadProgress?: (progress: number | undefined) => void;
	onParsing?: () => void;
}

/** Downloads and parses one ebook for the active reading session. */
export async function loadBookForReader({
	uuid,
	bookTitle,
	cover,
	fileSizeBytes,
	serverId,
	sourceFormat,
	callbacks = {},
}: {
	uuid: string;
	bookTitle: string;
	cover?: string | null;
	fileSizeBytes?: number;
	serverId: string | null;
	sourceFormat?: ReaderSourceFormat;
	callbacks?: LoadBookCallbacks;
}): Promise<ReaderBookData> {
	if (!serverId) throw new Error("Reading requires a server connection");

	callbacks.onDownloadProgress?.(0);
	const { url, filename } = await client.files.getReaderUrl({ uuid, serverId });
	const response = await fetch(url, { credentials: "include" });
	if (!response.ok) {
		throw new Error(`Download failed with status ${response.status}`);
	}
	const blob = await readBlobWithProgress(
		response,
		(progress) => callbacks.onDownloadProgress?.(progress),
		fileSizeBytes,
	);

	callbacks.onParsing?.();
	const resolvedFormat = ebookSourceFormatForFilename(filename);
	if (!resolvedFormat || (sourceFormat && resolvedFormat !== sourceFormat)) {
		throw new Error(`Unsupported ebook format: ${filename}`);
	}
	const data = await loadEbook(uuid, blob, filename, bookTitle, document);
	data.cover = cover ?? null;
	data.serverId = serverId;
	return data;
}
