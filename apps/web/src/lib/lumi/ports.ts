import type {
	ReaderSettings,
	SettingsPort,
	StoragePort,
} from "@lostcoords/lumi-reader-core";
import { readBlobWithProgress } from "@/lib/reader/fetch-with-progress";
import { client } from "@/utils/orpc";
import { getRawEpub, putRawEpub } from "./epub-store";
import { getLocalPosition, setLocalPosition } from "./position-store";

/** Fetch (and cache) the raw .epub for a book, streaming download progress; persist the resume locator locally. */
export function createStoragePort(
	onProgress?: (progress: number | undefined) => void,
	maxCached?: () => number,
): StoragePort {
	return {
		async loadBookFile(uuid) {
			const cached = await getRawEpub(uuid).catch(() => undefined);
			if (cached) return cached;
			onProgress?.(0);
			const { url } = await client.files.getSignedDownloadUrl({ uuid });
			const response = await fetch(url, { credentials: "include" });
			if (!response.ok)
				throw new Error(`Download failed with status ${response.status}`);
			const blob = await readBlobWithProgress(response, (p) => onProgress?.(p));
			void putRawEpub(uuid, blob, maxCached?.()).catch(() => {});
			return blob;
		},
		async getPosition(uuid) {
			return getLocalPosition(uuid);
		},
		setPosition(uuid, position) {
			setLocalPosition(uuid, position);
		},
	};
}

/** Settings port: reads the live engine snapshot; `fontId` carries the chosen family name. */
export function createSettingsPort(get: () => ReaderSettings): SettingsPort {
	return {
		get,
		fontCssValue: (fontId) =>
			fontId ? `"${fontId}", "Noto Serif JP", serif` : null,
		isFontOverride: (fontId) => Boolean(fontId),
		loadFont: async () => true,
		bookFontId: "serif",
	};
}
