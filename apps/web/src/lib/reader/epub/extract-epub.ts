/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 *
 * Adapted to read the archive with the platform (Blob.slice +
 * DecompressionStream, see ./zip-reader) instead of @zip.js / JSZip.
 */

import { XMLParser } from "fast-xml-parser";
import { dirname, joinPath, normalizePath } from "../paths";
import {
	type EpubContent,
	type EpubOPFContent,
	getManifestItems,
} from "./types";
import { openZip, type ZipReader } from "./zip-reader";

export interface ExtractedEpub {
	contentsDirectory: string;
	contents: EpubContent | EpubOPFContent;
	result: Record<string, string | Blob>;
}

export async function extractEpub(blob: Blob): Promise<ExtractedEpub> {
	const zip = await openZip(blob);
	const result: Record<string, string | Blob> = {};

	const containerXml = await zip.text("META-INF/container.xml");
	if (!containerXml) {
		throw new Error("Invalid EPUB: missing META-INF/container.xml");
	}

	const parser = new XMLParser({ ignoreAttributes: false });
	const container = parser.parse(containerXml);
	const rootFiles = container?.container?.rootfiles?.rootfile;
	const rootFile = Array.isArray(rootFiles) ? rootFiles[0] : rootFiles;
	const contentOpfFilename: string | undefined = rootFile?.["@_full-path"];
	if (!contentOpfFilename) {
		throw new Error("Invalid EPUB: container.xml has no rootfile");
	}

	const contentsXml = await zip.text(contentOpfFilename);
	if (contentsXml === undefined) {
		throw new Error(`Invalid EPUB: missing ${contentOpfFilename}`);
	}
	result[contentOpfFilename] = contentsXml;

	const contentsDirectory = dirname(contentOpfFilename);
	const contents = parser.parse(contentsXml) as EpubContent | EpubOPFContent;

	await Promise.all(
		getManifestItems(contents).map(async (item) => {
			const fileRelativePath = item["@_href"];
			if (!fileRelativePath) return;

			const name = findEntry(zip, contentsDirectory, fileRelativePath);
			if (!name) {
				console.warn(
					`EPUB manifest item not found in archive: ${fileRelativePath}`,
				);
				return;
			}

			const mediaType: string = item["@_media-type"] || "";
			if (mediaType.startsWith("image/")) {
				const image = await zip.blob(name, mediaType);
				if (image) result[fileRelativePath] = image;
			} else {
				const text = await zip.text(name);
				if (text !== undefined) result[fileRelativePath] = text;
			}
		}),
	);

	return { contentsDirectory, contents, result };
}

/** Manifest hrefs are relative to the OPF, but some books path them from the
 *  archive root, and some percent-encode them. */
function findEntry(
	zip: ZipReader,
	contentsDirectory: string,
	href: string,
): string | undefined {
	const candidates = [
		contentsDirectory === "."
			? normalizePath(href)
			: joinPath(contentsDirectory, href),
		normalizePath(href),
	];
	for (const candidate of candidates) {
		if (zip.has(candidate)) return candidate;
		const decoded = decodeURIComponent(candidate);
		if (zip.has(decoded)) return decoded;
	}
	return undefined;
}
