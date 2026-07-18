import * as fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../../lib/logger";
import {
	isSafePublicUrl,
	MAX_REMOTE_IMAGE_BYTES,
} from "../../../../lib/safe-url";

const log = logger.child({ component: "provider-utils" });

// ─── Transient failures ──────────────────────────────────
// "The provider couldn't answer" (429/5xx/network) is not "no data": the
// enrichment chain must NOT mark the book as enriched, so the gap is retried
// later. Mirrors AmazonTransientError for the HTTP API providers.

export class ProviderTransientError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProviderTransientError";
	}
}

/** Throws ProviderTransientError for rate-limit/server-side statuses (420 is Comicvine's throttle). */
function throwIfTransientStatus(status: number, provider: string): void {
	if (status === 429 || status === 420 || status >= 500) {
		throw new ProviderTransientError(
			`${provider} is temporarily unavailable (HTTP ${status})`,
		);
	}
}

/**
 * fetch that classifies failures: network errors and 429/420/5xx throw
 * ProviderTransientError; every other response is returned for the caller to
 * handle. Pacing stays at call sites — pacers are per-provider.
 */
export async function fetchOrTransient(
	provider: string,
	url: string | URL,
	init?: RequestInit,
): Promise<Response> {
	let response: Response;
	try {
		response = await fetch(url, init);
	} catch (error) {
		throw new ProviderTransientError(
			`${provider} is unreachable: ${(error as Error).message}`,
		);
	}
	throwIfTransientStatus(response.status, provider);
	return response;
}

// ─── TTL cache ───────────────────────────────────────────
// Bounded per-provider dedupe cache (series siblings repeat the same lookups).

export class TtlCache<V> {
	private map = new Map<string, { value: V; expiresAt: number }>();

	constructor(
		private ttlMs: number,
		private maxEntries: number,
	) {}

	get(key: string): V | undefined {
		const entry = this.map.get(key);
		if (!entry) return undefined;
		if (Date.now() > entry.expiresAt) {
			this.map.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key: string, value: V): void {
		if (!this.map.has(key) && this.map.size >= this.maxEntries) {
			const oldest = this.map.keys().next().value;
			if (oldest !== undefined) this.map.delete(oldest);
		}
		this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
	}

	clear(): void {
		this.map.clear();
	}
}

// ─── Cover download ──────────────────────────────────────
// Shared by all providers.

let coversDirCreated = false;

/** Downloads a remote cover into data/covers/<uuid><ext>; returns the cwd-relative path or null. */
export async function downloadCoverImage(
	imageUrl: string,
	uuid: string,
	options?: { headers?: Record<string, string> },
): Promise<string | null> {
	try {
		if (!isSafePublicUrl(imageUrl)) {
			log.warn({ imageUrl }, "Refusing to fetch cover from unsafe URL");
			return null;
		}
		const response = await fetch(imageUrl, {
			redirect: "error",
			headers: options?.headers,
		});
		if (!response.ok) return null;

		const contentLength = Number(response.headers.get("content-length"));
		if (
			Number.isFinite(contentLength) &&
			contentLength > MAX_REMOTE_IMAGE_BYTES
		) {
			return null;
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) return null;

		const urlExt = path.extname(new URL(imageUrl).pathname).toLowerCase();
		const ext = urlExt && urlExt !== "." ? urlExt : ".jpg";

		const coversDir = path.join(process.cwd(), "data/covers");
		if (!coversDirCreated) {
			await fs.mkdir(coversDir, { recursive: true });
			coversDirCreated = true;
		}

		const coverPath = path.join(coversDir, `${uuid}${ext}`);
		await fs.writeFile(coverPath, buffer, { flag: "wx" }).catch(() => {
			// File already exists, skip writing
		});

		return path.relative(process.cwd(), coverPath);
	} catch (error) {
		log.warn({ err: error }, "Cover download failed");
		return null;
	}
}

// ─── Request pacing ──────────────────────────────────────
// Minimum-interval gate per external API (module-level state per provider).

export function createRequestPacer(minIntervalMs: number): () => Promise<void> {
	// bun test sets NODE_ENV=test; mocked fetches shouldn't pay real delays.
	if (process.env.NODE_ENV === "test") return async () => {};
	let lastRequestAt = 0;
	return async () => {
		const wait = lastRequestAt + minIntervalMs - Date.now();
		if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
		lastRequestAt = Date.now();
	};
}

// ─── Text/date normalization ─────────────────────────────

/** Strips HTML tags/entities to plain text (provider descriptions are often HTML). */
export function stripHtml(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&apos;/gi, "'")
		.replace(/[ \t]+/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

const MONTHS: Record<string, string> = {
	jan: "01",
	feb: "02",
	mar: "03",
	apr: "04",
	may: "05",
	jun: "06",
	jul: "07",
	aug: "08",
	sep: "09",
	oct: "10",
	nov: "11",
	dec: "12",
};

// book_metadata.published_date is a Postgres `date` column: partial dates
// ("2013", "2013-06", "Jun 15, 2013") must be padded to full ISO or dropped.
export function normalizePublishedDate(
	raw: string | null | undefined,
): string | null {
	if (!raw) return null;
	const input = raw.trim();
	if (!input) return null;

	const iso = input.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
	if (iso?.[1]) {
		const year = Number(iso[1]);
		if (year < 1000 || year > 9999) return null;
		const month = iso[2] && Number(iso[2]) >= 1 && Number(iso[2]) <= 12;
		if (iso[2] && !month) return null;
		return `${iso[1]}-${iso[2] ?? "01"}-${iso[3] ?? "01"}`;
	}

	// Textual forms like "Jun 15, 2013" / "June 2013" (Open Library editions)
	const textual = input.match(
		/^([A-Za-z]{3,})\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?,?\s+)?(\d{4})$/,
	);
	if (textual?.[1] && textual[3]) {
		const month = MONTHS[textual[1].slice(0, 3).toLowerCase()];
		if (!month) return null;
		const day = textual[2] ? textual[2].padStart(2, "0") : "01";
		return `${textual[3]}-${month}-${day}`;
	}

	const yearOnly = input.match(/\b(\d{4})\b/);
	if (yearOnly?.[1]) return `${yearOnly[1]}-01-01`;
	return null;
}

/** Digits-only ISBN when the text looks like one (10/13 digits, hyphens ok). */
export function extractIsbnFromText(text: string): string | null {
	const cleaned = text.replace(/[-\s]/g, "");
	if (/^\d{13}$/.test(cleaned) || /^\d{9}[\dXx]$/.test(cleaned)) {
		return cleaned.toUpperCase();
	}
	return null;
}

// ─── ISBN-10 ↔ ISBN-13 conversion ────────────────────────
// Deterministic: same edition, different checksum scheme. Providers often
// return only one of the two; deriving the other keeps both columns filled
// and improves chained provider matching.

function isbn13CheckDigit(first12: string): string {
	let sum = 0;
	for (let i = 0; i < 12; i++) {
		sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
	}
	return String((10 - (sum % 10)) % 10);
}

function isbn10CheckDigit(first9: string): string {
	let sum = 0;
	for (let i = 0; i < 9; i++) {
		sum += Number(first9[i]) * (10 - i);
	}
	const check = (11 - (sum % 11)) % 11;
	return check === 10 ? "X" : String(check);
}

/** ISBN-13 for a valid ISBN-10 (hyphens ok); null when invalid. */
export function isbn10To13(isbn10: string): string | null {
	const cleaned = isbn10.replace(/[-\s]/g, "").toUpperCase();
	if (!/^\d{9}[\dX]$/.test(cleaned)) return null;
	if (isbn10CheckDigit(cleaned.slice(0, 9)) !== cleaned[9]) return null;
	const core = `978${cleaned.slice(0, 9)}`;
	return core + isbn13CheckDigit(core);
}

/** ISBN-10 for a valid 978-prefixed ISBN-13; null when invalid or 979 (no equivalent). */
export function isbn13To10(isbn13: string): string | null {
	const cleaned = isbn13.replace(/[-\s]/g, "");
	if (!/^978\d{10}$/.test(cleaned)) return null;
	if (isbn13CheckDigit(cleaned.slice(0, 12)) !== cleaned[12]) return null;
	const core = cleaned.slice(3, 12);
	return core + isbn10CheckDigit(core);
}

/** Fills the missing ISBN counterpart in place when only one is present. */
export function deriveIsbnPair<
	T extends { isbn10?: string | null; isbn13?: string | null },
>(metadata: T): T {
	if (metadata.isbn10 && !metadata.isbn13) {
		const isbn13 = isbn10To13(metadata.isbn10);
		if (isbn13) metadata.isbn13 = isbn13;
	} else if (metadata.isbn13 && !metadata.isbn10) {
		const isbn10 = isbn13To10(metadata.isbn13);
		if (isbn10) metadata.isbn10 = isbn10;
	}
	return metadata;
}
