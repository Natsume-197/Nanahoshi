const IMPRINT_PAREN =
	/[(（][^)）]*(?:文庫|ブックス|ラノベ|新書|コミックス|comics?|novels?|kindle)[^)）]*[)）]/giu;

const SERIES_TAGLINE = /[〜～~][^〜～~]{4,}[〜～~]/gu;

export function stripCatalogImprintParens(title: string): string {
	return title.replace(IMPRINT_PAREN, " ");
}

export function stripCatalogSeriesTagline(title: string): string {
	return title.replace(SERIES_TAGLINE, " ").replace(/\s+/g, " ").trim();
}

export function parseCatalogKanjiNumber(text: string): number | null {
	const digits: Record<string, number> = {
		一: 1,
		二: 2,
		三: 3,
		四: 4,
		五: 5,
		六: 6,
		七: 7,
		八: 8,
		九: 9,
	};
	const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
	let total = 0;
	let current = 0;
	for (const character of text) {
		if (character in digits) current = digits[character] ?? 0;
		else if (character in units) {
			total += (current || 1) * (units[character] ?? 1);
			current = 0;
		} else return null;
	}
	return total + current || null;
}

export function parseCatalogRomanNumber(text: string): number | null {
	const values: Record<string, number> = {
		I: 1,
		V: 5,
		X: 10,
		L: 50,
		C: 100,
		D: 500,
		M: 1000,
	};
	let total = 0;
	let previous = 0;
	for (const character of [...text.toUpperCase()].reverse()) {
		const value = values[character];
		if (!value) return null;
		if (value < previous) total -= value;
		else {
			total += value;
			previous = value;
		}
	}
	return total > 0 ? total : null;
}
