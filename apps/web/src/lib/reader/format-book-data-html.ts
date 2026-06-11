/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 *
 * Port notes: RxJS observable replaced by a plain function returning the
 * created object URLs; the caller is responsible for revoking them.
 */

import { isElementGaiji } from "./character-count";
import { buildDummyBookImage } from "./epub/utils";
import type { ReaderBookData } from "./types";

export interface FormattedBookHtml {
	elementHtml: string;
	objectUrls: string[];
}

export function formatBookDataHtml(
	bookData: ReaderBookData,
	document: Document,
	blurAfterToc: boolean,
): FormattedBookHtml {
	const { elementHtml, objectUrls } = getHtmlWithImageSource(bookData);

	const element = document.createElement("div");
	element.innerHTML = elementHtml;

	addImageContainerClass(element);
	removeSvgDimensions(element);
	addSpoilerTags(element, document, blurAfterToc);

	return { elementHtml: element.innerHTML, objectUrls };
}

function getHtmlWithImageSource(bookData: ReaderBookData) {
	const { blobs } = bookData;
	const objectUrls: string[] = [];

	let { elementHtml } = bookData;

	for (const [key, value] of Object.entries(blobs)) {
		const url = URL.createObjectURL(value);
		const dummyUrl = buildDummyBookImage(key);

		objectUrls.push(url);

		elementHtml = elementHtml
			.replaceAll(dummyUrl, url)
			.replaceAll(`ttu:${key}`, url);
	}

	return { elementHtml, objectUrls };
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
