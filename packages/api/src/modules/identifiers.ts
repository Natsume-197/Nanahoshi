// Pure ISBN/ASIN normalization + validation. Only validated identifiers drive
// automatic duplicate grouping — the cheapest guard against garbage ids in
// EPUBs (placeholders like 0000000000, malformed strings).

export function normalizeIsbn(s: string): string {
	return s.replace(/[\s-]/g, "").toUpperCase();
}

/** Rejects all-same-digit strings (0000000000, 9999999999, …). */
function isPlaceholderDigits(s: string): boolean {
	return /^(.)\1*$/.test(s);
}

export function isValidIsbn13(raw: string): boolean {
	const s = normalizeIsbn(raw);
	if (!/^\d{13}$/.test(s) || isPlaceholderDigits(s)) return false;
	let sum = 0;
	for (let i = 0; i < 12; i++) {
		sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
	}
	return (10 - (sum % 10)) % 10 === Number(s[12]);
}

export function isValidIsbn10(raw: string): boolean {
	const s = normalizeIsbn(raw);
	if (!/^\d{9}[\dX]$/.test(s) || isPlaceholderDigits(s)) return false;
	let sum = 0;
	for (let i = 0; i < 9; i++) {
		sum += Number(s[i]) * (10 - i);
	}
	sum += s[9] === "X" ? 10 : Number(s[9]);
	return sum % 11 === 0;
}

// Amazon ASIN — the only id Kindle-only editions carry. Match only the Kindle
// form (`B` + 9 alphanumerics); ISBN-10-style ASINs go through the ISBN path.
export function normalizeAsin(s: string): string {
	return s.trim().toUpperCase();
}

export function isValidAsin(raw: string): boolean {
	const s = normalizeAsin(raw);
	return /^B[0-9A-Z]{9}$/.test(s);
}
