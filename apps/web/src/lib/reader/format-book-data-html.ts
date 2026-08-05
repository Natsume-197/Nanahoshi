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
import {
	fitImageWidth,
	getImageDimensions,
	type ImageDimensions,
} from "./image-dimensions";
import { sanitizeBookHtmlToFragment } from "./sanitize-html";
import { BOOK_SANITIZE_VERSION, type ReaderBookData } from "./types";

export interface FormattedBookHtml {
	elementHtml: string;
	styleSheet: string;
	objectUrls: string[];
}

export async function formatBookDataHtml(
	bookData: ReaderBookData,
	document: Document,
	imageFitHeight: number,
): Promise<FormattedBookHtml> {
	const { elementHtml, styleSheet, objectUrls, blobByUrl } =
		getHtmlWithImageSource(bookData);

	const element = document.createElement("div");
	// The stored stylesheet's selectors are prefixed with .book-content; carry
	// the class so they can match here (the div itself is never serialized).
	element.className = "book-content";
	// Book HTML is attacker-controlled, so it is sanitized before it can touch
	// the live DOM — but entries cached at the current sanitize version were
	// already cleaned on the way in, and re-running DOMPurify over the whole
	// book on every open was the single most expensive step of opening one.
	// Older entries (and anything without the marker) still get cleaned here.
	if (bookData.sanitizeVersion === BOOK_SANITIZE_VERSION) {
		element.innerHTML = elementHtml;
	} else {
		element.appendChild(sanitizeBookHtmlToFragment(elementHtml));
	}

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
	wrapImages(element, document);

	return { elementHtml: element.innerHTML, styleSheet, objectUrls };
}

/** Marks both source shapes the generator emits for a packed image: the dummy
 *  GIF data URI (`data:image/gif;ttu:<key>;base64,…`) and a bare `ttu:<key>`. */
const IMAGE_REF_PREFIX_RE = /(?:data:image\/gif;)?ttu:/g;
const DUMMY_TAIL_RE = /^;base64,[A-Za-z0-9+/=]*/;
/** The dummy tail is a fixed ~60-char base64 GIF; cap the slice we test. */
const DUMMY_TAIL_MAX = 256;

/**
 * Swap every packed-image reference for its blob object URL in a single scan.
 * A `replaceAll` per blob rescans the whole book once per image (quadratic in
 * image count), which costs real time on illustration-heavy volumes. Keys are
 * matched longest-first against the blob map rather than by a character class,
 * so keys containing spaces or `;` keep resolving exactly as before.
 */
export function getHtmlWithImageSource(bookData: ReaderBookData) {
	const { blobs } = bookData;
	const objectUrls: string[] = [];
	const blobByUrl = new Map<string, Blob>();
	const urlByKey = new Map<string, string>();

	for (const [key, value] of Object.entries(blobs)) {
		const url = URL.createObjectURL(value);
		objectUrls.push(url);
		blobByUrl.set(url, value);
		urlByKey.set(key, url);
	}

	// Longest-first: one key may be a suffix-free prefix of another
	// (`img/a.jpg` vs `img/a.jpg.bak`); the longer one must win.
	const keysByLength = [...urlByKey.keys()].sort((a, b) => b.length - a.length);
	const replaceReferences = (input: string) => {
		const html = input;
		const out: string[] = [];
		let copiedTo = 0;

		IMAGE_REF_PREFIX_RE.lastIndex = 0;
		let match = IMAGE_REF_PREFIX_RE.exec(html);
		while (match) {
			const keyStart = match.index + match[0].length;
			const key = keysByLength.find((candidate) =>
				html.startsWith(candidate, keyStart),
			);
			if (!key) {
				match = IMAGE_REF_PREFIX_RE.exec(html);
				continue;
			}

			let end = keyStart + key.length;
			if (match[0].startsWith("data:")) {
				const tail = DUMMY_TAIL_RE.exec(html.slice(end, end + DUMMY_TAIL_MAX));
				if (tail) end += tail[0].length;
			}

			out.push(html.slice(copiedTo, match.index), urlByKey.get(key) as string);
			copiedTo = end;
			IMAGE_REF_PREFIX_RE.lastIndex = end;
			match = IMAGE_REF_PREFIX_RE.exec(html);
		}
		out.push(html.slice(copiedTo));
		return out.join("");
	};

	return {
		elementHtml: replaceReferences(bookData.elementHtml),
		styleSheet: replaceReferences(bookData.styleSheet),
		objectUrls,
		blobByUrl,
	};
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

function wrapImages(el: HTMLElement, document: Document) {
	for (const childNode of el.children) {
		for (const tag of Array.from(childNode.getElementsByTagName("img")).filter(
			(t) => !isElementGaiji(t),
		)) {
			const wrapper = document.createElement("span");
			const parent = tag.parentElement || childNode;
			wrapper.classList.add("ttu-img-parent");
			parent.insertBefore(wrapper, tag);
			wrapper.appendChild(tag);
		}

		for (const tag of Array.from(childNode.getElementsByTagName("svg")).filter(
			(t) => t.getElementsByTagName("image").length,
		)) {
			const wrapper = document.createElement("span");
			const parent = tag.parentElement || childNode;
			wrapper.classList.add("ttu-img-parent");
			parent.insertBefore(wrapper, tag);
			wrapper.appendChild(tag);
		}
	}
}
