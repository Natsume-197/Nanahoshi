/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 *
 * Port notes: RxJS observable replaced by a plain function returning the
 * created object URLs; the caller is responsible for revoking them.
 */

import { isElementGaiji } from "./character-count";
import { parseCssRules } from "./css-parser";
import { buildDummyBookImage } from "./epub/utils";
import {
	fitImageWidth,
	getImageDimensions,
	type ImageDimensions,
} from "./image-dimensions";
import type { ReaderBookData } from "./types";

export interface FormattedBookHtml {
	elementHtml: string;
	objectUrls: string[];
}

export async function formatBookDataHtml(
	bookData: ReaderBookData,
	document: Document,
	blurAfterToc: boolean,
	imageFitHeight: number,
): Promise<FormattedBookHtml> {
	const { elementHtml, objectUrls, blobByUrl } =
		getHtmlWithImageSource(bookData);

	const element = document.createElement("div");
	// The stored stylesheet's selectors are prefixed with .book-content; carry
	// the class so they can match here (the div itself is never serialized).
	element.className = "book-content";
	element.innerHTML = elementHtml;

	const matchers = buildAxisPinnedMatchers(bookData.styleSheet, document);
	// Before reserveImageDimensions: it must see the author's width/height
	// attributes only, not the reserved ones.
	markContainFit(element, matchers);
	await reserveImageDimensions(
		element,
		blobByUrl,
		imageFitHeight,
		matchers.pinsHeight,
	);
	addImageContainerClass(element);
	removeSvgDimensions(element);
	addSpoilerTags(element, document, blurAfterToc);

	return { elementHtml: element.innerHTML, objectUrls };
}

function getHtmlWithImageSource(bookData: ReaderBookData) {
	const { blobs } = bookData;
	const objectUrls: string[] = [];
	const blobByUrl = new Map<string, Blob>();

	let { elementHtml } = bookData;

	for (const [key, value] of Object.entries(blobs)) {
		const url = URL.createObjectURL(value);
		const dummyUrl = buildDummyBookImage(key);

		objectUrls.push(url);
		blobByUrl.set(url, value);

		elementHtml = elementHtml
			.replaceAll(dummyUrl, url)
			.replaceAll(`ttu:${key}`, url);
	}

	return { elementHtml, objectUrls, blobByUrl };
}

export interface AxisPinnedMatchers {
	pinsWidth: (el: Element) => boolean;
	pinsHeight: (el: Element) => boolean;
}

/**
 * Matchers for images whose width/height the EPUB stylesheet pins (e.g.
 * `width: 100%` or `height: 100%` full-page illustrations). A pinned axis
 * clashes with anything sizing the other axis — a reserved `width` attribute,
 * or the reader's max-width/max-height page caps — and the browser then
 * ignores the aspect-ratio and distorts the image.
 */
export function buildAxisPinnedMatchers(
	styleSheet: string,
	document: Document,
): AxisPinnedMatchers {
	const probe = document.createElement("div");

	const buildMatcher = (property: RegExp) => {
		const selectors = parseCssRules(styleSheet)
			.filter((rule) =>
				rule.declarations.some(
					(d) =>
						property.test(d.property) &&
						d.value.trim().toLowerCase() !== "auto",
				),
			)
			.flatMap((rule) => rule.selectors)
			.filter((selector) => {
				try {
					probe.matches(selector);
					return true;
				} catch {
					return false;
				}
			});

		if (!selectors.length) return () => false;
		const combined = selectors.join(",");
		return (el: Element) => el.matches(combined);
	};

	return {
		pinsWidth: buildMatcher(/^(min-)?width$/i),
		pinsHeight: buildMatcher(/^(min-)?height$/i),
	};
}

/**
 * Mark images for `object-fit: contain` (reader.css) unless the EPUB pins
 * both axes itself — that is an intentional stretch (decorative separators,
 * em-sized inline icons) and must be respected. With at most one axis pinned
 * the content box only ever gets distorted by a reader page cap clamping the
 * free axis (e.g. `width: 100%` + the paginated max-height), and contain
 * repaints the content proportionally inside that box.
 */
function markContainFit(el: HTMLElement, matchers: AxisPinnedMatchers) {
	for (const imgEl of Array.from(el.getElementsByTagName("img"))) {
		const pinnedWidth =
			!!imgEl.style.width ||
			imgEl.hasAttribute("width") ||
			matchers.pinsWidth(imgEl);
		const pinnedHeight =
			!!imgEl.style.height ||
			imgEl.hasAttribute("height") ||
			matchers.pinsHeight(imgEl);
		if (pinnedWidth && pinnedHeight) continue;
		imgEl.toggleAttribute("data-ttu-contain-fit", true);
	}
}

/**
 * Reserve layout space for images before their blob URLs load, so late image
 * loads don't shift the text around the restored reading position.
 *
 * Only the `width` attribute plus an inline `aspect-ratio` are set: an
 * attribute loses to any stylesheet rule (epub CSS keeps winning), and
 * leaving `height` auto lets the ratio drive it, so images the epub styles
 * itself (e.g. `width: 100%`) keep their proportions. Images whose height the
 * stylesheet pins get only the aspect-ratio — see buildHeightStyledMatcher.
 */
async function reserveImageDimensions(
	el: HTMLElement,
	blobByUrl: Map<string, Blob>,
	fitHeight: number,
	isHeightStyled: (el: Element) => boolean,
) {
	const pendingByBlob = new Map<Blob, Promise<ImageDimensions | undefined>>();

	await Promise.all(
		Array.from(el.getElementsByTagName("img")).map(async (imgEl) => {
			if (imgEl.hasAttribute("width") || imgEl.hasAttribute("height")) return;
			if (imgEl.style.width || imgEl.style.height || imgEl.style.aspectRatio) {
				return;
			}

			const blob = blobByUrl.get(imgEl.getAttribute("src") || "");
			if (!blob) return;

			let pending = pendingByBlob.get(blob);
			if (!pending) {
				pending = getImageDimensions(blob);
				pendingByBlob.set(blob, pending);
			}
			const dimensions = await pending;
			if (!dimensions) return;

			imgEl.style.aspectRatio = `${dimensions.width} / ${dimensions.height}`;

			// Gaiji are sized by the epub CSS (typically height: 1em); the
			// ratio alone reserves their width.
			if (isElementGaiji(imgEl)) return;

			// The stylesheet drives the height; the ratio derives the width.
			if (isHeightStyled(imgEl)) return;

			imgEl.setAttribute("data-ttu-natural-width", String(dimensions.width));
			imgEl.setAttribute("data-ttu-natural-height", String(dimensions.height));
			imgEl.setAttribute("width", String(fitImageWidth(dimensions, fitHeight)));
		}),
	);
}

function addImageContainerClass(el: HTMLElement) {
	for (const imgEl of Array.from(el.getElementsByTagName("img"))) {
		const parentEl = imgEl.parentElement;
		parentEl?.classList.add("ttu-img-container");

		if (!isElementGaiji(imgEl)) {
			parentEl?.classList.add("ttu-illustration-container");
		}
	}
}

function removeSvgDimensions(el: HTMLElement) {
	for (const tag of Array.from(el.getElementsByTagName("svg"))) {
		tag.removeAttribute("width");
		tag.removeAttribute("height");
	}
}

function addSpoilerTags(
	el: HTMLElement,
	document: Document,
	blurAfterToc: boolean,
) {
	const getChildNodesAfterTableOfContents = () => {
		let childNodes = [...el.children];
		const afterContentsDivIndex =
			childNodes.findIndex(
				(childNode) => childNode.getElementsByTagName("a").length > 1,
			) + 1;
		if (
			afterContentsDivIndex > 0 &&
			afterContentsDivIndex < childNodes.length
		) {
			childNodes = childNodes.slice(afterContentsDivIndex);
		}
		return childNodes;
	};

	const createWrapper = (tag: Element, childNode: Element) => {
		const imgWrapper = document.createElement("span");
		const parentElement = tag.parentElement || childNode;

		imgWrapper.classList.add("ttu-img-parent");
		imgWrapper.toggleAttribute("data-ttu-spoiler-img");

		parentElement.insertBefore(imgWrapper, tag);
		imgWrapper.appendChild(tag);
	};

	const targets = blurAfterToc
		? getChildNodesAfterTableOfContents()
		: [...el.children];

	for (const childNode of targets) {
		for (const tag of Array.from(childNode.getElementsByTagName("img")).filter(
			(t) => !isElementGaiji(t),
		)) {
			createWrapper(tag, childNode);
		}

		for (const tag of Array.from(childNode.getElementsByTagName("svg")).filter(
			(t) => t.getElementsByTagName("image").length,
		)) {
			createWrapper(tag, childNode);
		}
	}
}
