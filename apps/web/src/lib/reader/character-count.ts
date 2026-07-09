/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

export function isElementGaiji(el: HTMLImageElement) {
	return Array.from(el.classList).some((className) =>
		className.includes("gaiji"),
	);
}

export function isNodeGaiji(node: Node) {
	if (!(node instanceof HTMLImageElement)) {
		return false;
	}
	return isElementGaiji(node);
}

// Covers <img> and SVG <image> (manga pages are commonly svg-wrapped).
export function isNodeImage(node: Node) {
	if (node instanceof HTMLImageElement) return true;
	return (
		node.nodeType === Node.ELEMENT_NODE &&
		(node as Element).localName === "image"
	);
}

export function getCharacterCount(node: Node) {
	// Images weigh 1 so they exist in the char-count-based position system
	// (bookmarks, progress, restore); image-only books would otherwise have
	// charCount 0 and no anchors at all. Stats for text books shift by only
	// +1 per illustration.
	return isNodeImage(node) ? 1 : getRawCharacterCount(node);
}

const isNotJapaneseRegex =
	/[^0-9A-Z○◯々-〇〻ぁ-ゖゝ-ゞァ-ヺー０-９Ａ-Ｚｦ-ﾝ\p{Radical}\p{Unified_Ideograph}]+/gimu;

function getRawCharacterCount(node: Node) {
	if (!node.textContent) return 0;
	return countUnicodeCharacters(
		node.textContent.replace(isNotJapaneseRegex, ""),
	);
}

/**
 * Because '𠮟る'.length = 3
 */
function countUnicodeCharacters(s: string) {
	return Array.from(s).length;
}
