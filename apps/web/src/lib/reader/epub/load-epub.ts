/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { formatStyleSheet } from "../format-style-sheet";
import { BOOK_COUNT_VERSION, type ReaderBookData } from "../types";
import { extractEpub } from "./extract-epub";
import { generateEpubHtml } from "./generate-epub-html";
import { generateEpubStyleSheet } from "./generate-epub-style-sheet";
import { getMetadata, toArray } from "./types";
import { reduceObjToBlobs } from "./utils";

export async function loadEpub(
	uuid: string,
	blob: Blob,
	fallbackTitle: string,
	document: Document,
): Promise<ReaderBookData> {
	const { contents, result: data, contentsDirectory } = await extractEpub(blob);
	const result = generateEpubHtml(data, contents, document, contentsDirectory);

	let title = fallbackTitle;
	let language = "";

	const metadata = getMetadata(contents);

	if (metadata) {
		const titleValues = toArray(metadata["dc:title"]);
		const languageValues = toArray(metadata["dc:language"]);

		for (const dcTitle of titleValues) {
			if (typeof dcTitle === "string") {
				title = dcTitle;
				break;
			}
			if (dcTitle?.["#text"]) {
				title = dcTitle["#text"];
				break;
			}
		}

		language =
			languageValues.reduce<string[]>((languages, dcLanguage) => {
				try {
					if (typeof dcLanguage === "string") {
						languages.push(...Intl.getCanonicalLocales(dcLanguage.trim()));
					} else if (dcLanguage?.["#text"]) {
						languages.push(
							...Intl.getCanonicalLocales(dcLanguage["#text"].trim()),
						);
					}
				} catch (_) {
					// no-op
				}

				return languages;
			}, [])?.[0] || "";
	}

	if (!language) {
		language = "ja";
		console.warn(
			`no language data found for ${fallbackTitle} - fallback to ja`,
		);
	}

	return {
		uuid,
		title,
		language,
		elementHtml: result.element.innerHTML,
		styleSheet: formatStyleSheet(
			generateEpubStyleSheet(data, contents),
			".book-content",
		),
		blobs: reduceObjToBlobs(data),
		characters: result.characters,
		sections: result.sections,
		storedAt: Date.now(),
		countVersion: BOOK_COUNT_VERSION,
	};
}
