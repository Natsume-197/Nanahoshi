/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 *
 * Port notes: the optional "import HTML fix" modes from ttu (OFF by default
 * there) are not ported; behavior matches ttu with ImportHTMLFixMode.OFF.
 */

import {
	getCharacterCount,
	isNodeGaiji,
	isNodeImage,
} from "../character-count";
import { getParagraphNodes } from "../get-paragraph-nodes";
import { basename, dirname, joinPath } from "../paths";
import type { Section } from "../types";
import {
	type EpubContent,
	type EpubOPFContent,
	getManifestItems,
	getSpineItemRefs,
} from "./types";
import { buildDummyBookImage } from "./utils";

export const prependValue = "ttu-";

export interface GeneratedEpubHtml {
	element: HTMLElement;
	characters: number;
	sections: Section[];
}

export function generateEpubHtml(
	data: Record<string, string | Blob>,
	contents: EpubContent | EpubOPFContent,
	document: Document,
	contentsDirectory: string,
): GeneratedEpubHtml {
	const fallbackData = new Map<string, string>();

	let tocData = { type: 3, content: "" };
	let navKey = "";

	const itemIdToHtmlRef = getManifestItems(contents).reduce<
		Record<string, string>
	>((acc, item) => {
		if (item["@_fallback"]) {
			fallbackData.set(item["@_id"], item["@_fallback"]);
		}

		if (
			item["@_media-type"] === "application/xhtml+xml" ||
			item["@_media-type"] === "text/html"
		) {
			acc[item["@_id"]] = item["@_href"];

			if (item["@_properties"] === "nav") {
				navKey = item["@_href"];
			}
		}
		return acc;
	}, {});

	const blobLocations = Object.entries(data).reduce<string[]>(
		(acc, [key, value]) => {
			const isV2Toc = key.endsWith(".ncx") && !tocData.content;

			if (isV2Toc || navKey === key) {
				tocData = {
					type: isV2Toc ? 2 : 3,
					content: value as string,
				};
			}

			if (value instanceof Blob) {
				acc.push(key);
			}
			return acc;
		},
		[],
	);

	const parser = new DOMParser();
	const itemRefs = getSpineItemRefs(contents);
	const sectionData: Section[] = [];
	const result = document.createElement("div");

	let mainChapters: Section[] = [];
	let firstChapterMatchIndex = -1;

	if (tocData.type && tocData.content) {
		let parsedToc = parser.parseFromString(tocData.content, "text/html");

		if (tocData.type === 3) {
			let navTocElement = parsedToc.querySelector(
				'nav[epub\\:type="toc"],nav#toc',
			);

			if (!navTocElement) {
				parsedToc = parser.parseFromString(tocData.content, "text/xml");
			}

			navTocElement = parsedToc.querySelector('nav[epub\\:type="toc"],nav#toc');

			if (navTocElement) {
				mainChapters = [...navTocElement.querySelectorAll("a")].map((elm) => {
					const anchor = elm as HTMLAnchorElement;

					return {
						reference: anchor.href,
						charactersWeight: 1,
						label: anchor.textContent?.trim() || "",
					};
				});
			}
		} else {
			mainChapters = [...parsedToc.querySelectorAll("navPoint")].map((elm) => {
				const navLabel = elm.querySelector("navLabel text");
				const contentElm = elm.querySelector("content");

				return {
					reference: contentElm?.getAttribute("src") || "",
					charactersWeight: 1,
					label: navLabel?.textContent?.trim() || "",
				};
			});
		}
	}

	if (mainChapters.length) {
		firstChapterMatchIndex = itemRefs.findIndex((ref) =>
			mainChapters[0].reference.includes(
				itemIdToHtmlRef[ref["@_idref"].split("/").pop() || ""],
			),
		);

		if (firstChapterMatchIndex !== 0) {
			const firstRef = itemRefs[0]["@_idref"];
			const firstHTMLRef = itemIdToHtmlRef[firstRef];
			const fallbackRef = fallbackData.get(firstRef);
			const reference =
				firstHTMLRef ||
				(fallbackRef ? itemIdToHtmlRef[fallbackRef] : firstHTMLRef);

			mainChapters.unshift({
				reference,
				charactersWeight: 1,
				label: "Preface",
				startCharacter: 0,
			});
		}
	}

	let currentMainChapter = mainChapters[0];
	let currentMainChapterId = currentMainChapter
		? `${prependValue}${itemRefs[0]["@_idref"]}`
		: "";
	let currentMainChapterIndex = 0;
	let previousCharacterCount = 0;
	let currentCharCount = 0;

	for (const item of itemRefs) {
		let itemIdRef = item["@_idref"];
		let htmlHref = itemIdToHtmlRef[itemIdRef];

		if (!htmlHref && fallbackData.has(itemIdRef)) {
			itemIdRef = fallbackData.get(itemIdRef) as string;
			htmlHref = itemIdToHtmlRef[itemIdRef];
		}

		const contentToParse = (data[htmlHref] as string) || "";

		let parsedContent = parser.parseFromString(contentToParse, "text/html");
		let body: HTMLElement | null = parsedContent.body;

		if (!body?.childNodes?.length) {
			parsedContent = parser.parseFromString(contentToParse, "text/xml");
			body = parsedContent.querySelector("body");

			if (!body?.childNodes?.length) {
				console.warn(`Unable to find valid body content for ${htmlHref}`);
				continue;
			}
		}

		const htmlClass = parsedContent.querySelector("html")?.className || "";
		const bodyId = body.id || "";
		const bodyClass = body.className || "";

		for (const elm of [...body.querySelectorAll("image,img")]) {
			const attributes =
				elm.tagName.toLowerCase() === "image"
					? elm.getAttributeNames().filter((attr) => attr.endsWith("href"))
					: ["src"];

			for (const attr of attributes) {
				const value = elm.getAttribute(attr);

				if (value) {
					elm.setAttribute(attr, joinPath(dirname(htmlHref), value));
				}
			}
		}

		let innerHtml = body.innerHTML || "";

		for (const blobLocation of blobLocations) {
			innerHtml = innerHtml.replaceAll(
				relative(contentsDirectory, blobLocation),
				buildDummyBookImage(blobLocation),
			);
		}

		const childBodyDiv = document.createElement("div");
		childBodyDiv.className = `ttu-book-body-wrapper ${bodyClass}`;
		if (bodyId) {
			childBodyDiv.id = bodyId;
		}
		childBodyDiv.innerHTML = innerHtml;

		const childHtmlDiv = document.createElement("div");
		childHtmlDiv.className = `ttu-book-html-wrapper ${htmlClass}`;
		childHtmlDiv.appendChild(childBodyDiv);

		const childWrapperDiv = document.createElement("div");
		childWrapperDiv.id = `${prependValue}${itemIdRef}`;
		childWrapperDiv.appendChild(childHtmlDiv);

		result.appendChild(childWrapperDiv);

		const { characterCount: elementCharCount, textCharacterCount } =
			countForElement(childWrapperDiv);

		currentCharCount += elementCharCount;

		// Keyed to *text* only: image weights count toward position/progress,
		// but an image-only section must keep the margin-collapse styling.
		if (!textCharacterCount) {
			childHtmlDiv.classList.add("ttu-no-text");
			childBodyDiv.classList.add("ttu-no-text");
		}

		const mainChapterIndex = mainChapters.findIndex((chapter) =>
			chapter.reference.includes(htmlHref.split("/").pop() || ""),
		);
		const mainChapter =
			mainChapterIndex > -1 ? mainChapters[mainChapterIndex] : undefined;
		const characters = currentCharCount - previousCharacterCount;

		if (mainChapter) {
			const oldMainChapterIndex = currentMainChapterIndex;

			currentMainChapter = mainChapter;
			currentMainChapterIndex = sectionData.length;
			currentMainChapterId = `${prependValue}${itemIdRef}`;

			sectionData.push({
				reference: currentMainChapterId,
				charactersWeight: characters || 1,
				label: currentMainChapter.label,
				startCharacter: currentMainChapterIndex
					? (sectionData[oldMainChapterIndex].startCharacter as number) +
						(sectionData[oldMainChapterIndex].characters as number)
					: 0,
				characters,
			});
		} else if (currentMainChapter) {
			(sectionData[currentMainChapterIndex].characters as number) += characters;

			sectionData.push({
				reference: `${prependValue}${itemIdRef}`,
				charactersWeight: characters || 1,
				parentChapter: currentMainChapterId,
			});
		}

		previousCharacterCount = currentCharCount;
	}

	clearAllBadImageRef(result);
	fixXHtmlHref(result);
	flattenAnchorHref(result);

	return {
		element: result,
		characters: currentCharCount,
		sections: sectionData.filter((item) =>
			item.reference.startsWith(prependValue),
		),
	};
}

function countForElement(containerEl: Node) {
	const paragraphs = getParagraphNodes(containerEl);

	let characterCount = 0;
	let textCharacterCount = 0;

	for (const node of paragraphs) {
		const count = getCharacterCount(node);
		characterCount += count;
		// Gaiji are inline character replacements, so they count as text.
		if (!isNodeImage(node) || isNodeGaiji(node)) {
			textCharacterCount += count;
		}
	}

	return { characterCount, textCharacterCount };
}

/**
 * Clear all references that aren't packed, which could be caused by:
 * - Bad input file (doesn't include the required image)
 * - Bad image file extension
 */
function clearAllBadImageRef(el: HTMLElement) {
	const clearTagBadImageAttribute = (tag: Element, attributeName: string) => {
		const attr = tag.getAttribute(attributeName);
		if (
			attr &&
			!(attr.startsWith("ttu:") || attr.startsWith("data:image/gif;ttu:"))
		) {
			tag.setAttribute(`data-ttu-${attributeName}`, attr);
			tag.removeAttribute(attributeName);
		}
	};

	for (const tag of Array.from(el.getElementsByTagName("image"))) {
		clearTagBadImageAttribute(tag, "href");
	}

	for (const tag of Array.from(el.getElementsByTagName("img"))) {
		clearTagBadImageAttribute(tag, "src");
	}
}

/** Converts attributes like xlink:href to href */
function fixXHtmlHref(el: HTMLElement) {
	for (const tag of Array.from(el.getElementsByTagName("image")).filter(
		(t) => !t.getAttributeNames().some((x) => x === "href"),
	)) {
		const attr = Array.from(tag.attributes).find((a) =>
			a.name.endsWith("href"),
		);
		if (!attr) continue;

		tag.setAttribute("href", attr.value);
	}
}

function flattenAnchorHref(el: HTMLElement) {
	for (const tag of Array.from(el.getElementsByTagName("a"))) {
		const oldHref = tag.getAttribute("href");
		if (!oldHref) continue;
		tag.setAttribute("href", `#${oldHref.replace(/.+#/, "")}`);
	}
}

/**
 * Replicates https://nodejs.org/api/path.html#path_path_relative_from_to
 */
function relative(fromPath: string, toPath: string): string {
	const fromDirName = dirname(fromPath);
	const toDirName = dirname(toPath);
	const toFilename = basename(toPath);

	if (fromDirName === toDirName) {
		return toFilename;
	}

	const fromParts = fromDirName === "." ? [] : fromDirName.split("/");
	const toParts = toDirName === "." ? [] : toDirName.split("/");

	if (fromParts.length >= toParts.length) {
		for (let i = 0; i < fromParts.length; i += 1) {
			if (fromParts[i] !== toParts[i]) {
				return joinPath(
					"../".repeat(fromParts.length - i) + toParts.slice(i).join("/"),
					toFilename,
				);
			}
		}
	}
	for (let i = 0; i < fromParts.length; i += 1) {
		if (fromParts[i] !== toParts[i]) {
			return joinPath(
				"../".repeat(fromParts.length - i) + toParts.slice(i).join("/"),
				toFilename,
			);
		}
	}

	return joinPath(
		toParts.slice(fromParts.length - toParts.length).join("/"),
		toFilename,
	);
}
