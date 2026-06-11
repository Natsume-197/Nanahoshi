/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 *
 * Adapted to use JSZip (already a project dependency) instead of @zip.js.
 */

import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { dirname, joinPath, normalizePath } from "../paths";
import {
	type EpubContent,
	type EpubOPFContent,
	getManifestItems,
} from "./types";

export interface ExtractedEpub {
	contentsDirectory: string;
	contents: EpubContent | EpubOPFContent;
	result: Record<string, string | Blob>;
}

export async function extractEpub(blob: Blob): Promise<ExtractedEpub> {
	const zip = await JSZip.loadAsync(blob);
	const result: Record<string, string | Blob> = {};

	const containerFile = zip.file("META-INF/container.xml");
	if (!containerFile) {
		throw new Error("Invalid EPUB: missing META-INF/container.xml");
	}
	const containerXml = await containerFile.async("string");

	const parser = new XMLParser({ ignoreAttributes: false });
	const container = parser.parse(containerXml);
	const rootFiles = container?.container?.rootfiles?.rootfile;
	const rootFile = Array.isArray(rootFiles) ? rootFiles[0] : rootFiles;
	const contentOpfFilename: string | undefined = rootFile?.["@_full-path"];
	if (!contentOpfFilename) {
		throw new Error("Invalid EPUB: container.xml has no rootfile");
	}

	const opfFile = zip.file(contentOpfFilename);
	if (!opfFile) {
		throw new Error(`Invalid EPUB: missing ${contentOpfFilename}`);
	}
	const contentsXml = await opfFile.async("string");
	result[contentOpfFilename] = contentsXml;

	const contentsDirectory = dirname(contentOpfFilename);
	const contents = parser.parse(contentsXml) as EpubContent | EpubOPFContent;

	const findEntry = (href: string) => {
		const candidates = [
			contentsDirectory === "."
				? normalizePath(href)
				: joinPath(contentsDirectory, href),
			normalizePath(href),
		];
		for (const candidate of candidates) {
			const entry =
				zip.file(candidate) ?? zip.file(decodeURIComponent(candidate));
			if (entry) return entry;
		}
		return undefined;
	};

	await Promise.all(
		getManifestItems(contents).map(async (item) => {
			const fileRelativePath = item["@_href"];
			if (!fileRelativePath) return;

			const entry = findEntry(fileRelativePath);
			if (!entry || entry.dir) {
				console.warn(
					`EPUB manifest item not found in archive: ${fileRelativePath}`,
				);
				return;
			}

			const mediaType: string = item["@_media-type"] || "";
			if (mediaType.startsWith("image/")) {
				const buffer = await entry.async("arraybuffer");
				result[fileRelativePath] = new Blob([buffer], { type: mediaType });
			} else {
				result[fileRelativePath] = await entry.async("string");
			}
		}),
	);

	return { contentsDirectory, contents, result };
}
