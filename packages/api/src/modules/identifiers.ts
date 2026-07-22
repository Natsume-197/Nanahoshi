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

/** ISBN-13 for a valid ISBN-10; null when the source is invalid. */
export function isbn10To13(raw: string): string | null {
	if (!isValidIsbn10(raw)) return null;
	const body = `978${normalizeIsbn(raw).slice(0, 9)}`;
	let sum = 0;
	for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
	return `${body}${(10 - (sum % 10)) % 10}`;
}

/** ISBN-10 for a valid 978-prefixed ISBN-13; 979 has no equivalent. */
export function isbn13To10(raw: string): string | null {
	if (!isValidIsbn13(raw)) return null;
	const isbn13 = normalizeIsbn(raw);
	if (!isbn13.startsWith("978")) return null;
	const body = isbn13.slice(3, 12);
	let sum = 0;
	for (let i = 0; i < 9; i++) sum += Number(body[i]) * (10 - i);
	const check = (11 - (sum % 11)) % 11;
	return `${body}${check === 10 ? "X" : check}`;
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

// Opaque OPF unique-identifier (publisher/store id). Unlike ISBN/ASIN there is
// nothing to validate, so the guards only reject what is clearly NOT a stable
// publisher id: uuids (per-copy), calibre ids (per-install), placeholders, and
// values too short/long to be meaningful.
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function normalizeEmbeddedUid(s: string): string {
	return s.trim();
}

export function isUsableEmbeddedUid(raw: string): boolean {
	const s = normalizeEmbeddedUid(raw);
	// uuid/calibre schemes are per-copy or per-install ids, never stable.
	if (/^(urn:)?uuid:/i.test(s) || /^calibre:/i.test(s)) return false;
	const core = s.replace(/^urn:/i, "");
	if (core.length < 6 || core.length > 64) return false;
	if (UUID_RE.test(core.toLowerCase())) return false;
	if (/^(.)\1*$/.test(core)) return false;
	// A real id already covered by the ISBN/ASIN paths must not double-group.
	if (isValidAsin(core) || isValidIsbn13(core) || isValidIsbn10(core))
		return false;
	return true;
}
