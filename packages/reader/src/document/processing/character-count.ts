export function isElementGaiji(el: HTMLImageElement) {
	return Array.from(el.classList).some((className) =>
		className.includes("gaiji"),
	);
}

// Covers <img> and SVG <image> (visual pages are commonly svg-wrapped).
export function isNodeImage(node: Node) {
	return (
		node.nodeType === Node.ELEMENT_NODE &&
		((node as Element).localName === "img" ||
			(node as Element).localName === "image")
	);
}

export function getCharacterCount(node: Node) {
	// Images weigh 1 so they exist in the char-count-based position system
	// (progress, restore); image-only books would otherwise have
	// charCount 0 and no anchors at all. Stats for text books shift by only
	// +1 per illustration.
	return isNodeImage(node) ? 1 : getRawCharacterCount(node);
}

/**
 * A position character is any Unicode letter or number plus the Japanese
 * iteration marks that Unicode does not classify as either. Punctuation and
 * whitespace stay weightless so this remains compatible with the reader's
 * existing progress semantics, while no longer turning Korean, Arabic,
 * Cyrillic, Hebrew, and other scripts into empty books.
 */
const countedCharacterRegex = /[\p{Letter}\p{Number}○◯々-〇〻ゝゞヽヾー]/u;

function getRawCharacterCount(node: Node) {
	if (!node.textContent) return 0;
	return countTextCharacters(node.textContent);
}

export function countTextCharacters(text: string) {
	let count = 0;
	for (const character of text) {
		if (countedCharacterRegex.test(character)) count += 1;
	}
	return count;
}

/** Number of reader-position characters before a UTF-16 source offset. */
export function countTextCharactersBeforeOffset(text: string, offset: number) {
	return countTextCharacters(text.slice(0, Math.max(0, offset)));
}

/**
 * Converts a reader-position count into a UTF-16 source offset. Returning the
 * start of the next counted character makes the result safe for DOM Ranges.
 */
export function sourceOffsetForCharacterCount(text: string, target: number) {
	if (target <= 0) return 0;
	let count = 0;
	let offset = 0;
	for (const character of text) {
		if (countedCharacterRegex.test(character)) {
			if (count >= target) return offset;
			count += 1;
		}
		offset += character.length;
	}
	return text.length;
}
