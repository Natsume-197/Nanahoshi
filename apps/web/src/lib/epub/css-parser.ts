/**
 * Sanitizes book CSS: removes empty rules and .bg-* classes to avoid Tailwind conflicts.
 */
export function parseCss(cssText: string): string[] {
	const rules: string[] = [];
	let cursor = 0;
	const len = cssText.length;

	while (cursor < len) {
		while (cursor < len && /\s/.test(cssText[cursor])) cursor++;

		const selectorStart = cursor;
		while (cursor < len && cssText[cursor] !== "{") cursor++;
		const selector = cssText.slice(selectorStart, cursor).trim();

		if (!selector) break;

		cursor++;
		let level = 1;
		const blockStart = cursor;
		while (cursor < len && level > 0) {
			if (cssText[cursor] === "{") level++;
			else if (cssText[cursor] === "}") level--;
			cursor++;
		}

		if (selector[0] === "." && !selector.includes(".bg-")) {
			if (cssText.slice(blockStart, cursor).trim() === "}") continue;
			rules.push(cssText.slice(selectorStart, cursor));
		}
	}

	return rules;
}
