import path from "node:path";
import sharp from "sharp";
import { providerRequestSignal } from "../../../../infrastructure/providerAbort";
import { acquireCover } from "../../../../lib/cover-store";
import { logger } from "../../../../lib/logger";
import {
	isSafePublicUrl,
	MAX_REMOTE_IMAGE_BYTES,
} from "../../../../lib/safe-url";
import type { CatalogIdentityEvidence } from "../../../../modules/catalogIdentity";
import { isbn10To13, isbn13To10 } from "../../../../modules/identifiers";

export { isbn10To13, isbn13To10 };

const log = logger.child({ component: "provider-utils" });

// ─── Transient failures ──────────────────────────────────
// "The provider couldn't answer" (429/5xx/network) is not "no data": the
// enrichment chain must NOT mark the book as enriched, so the gap is retried
// later. Mirrors AmazonTransientError for the HTTP API providers.

export type ProviderTransientErrorOptions = ErrorOptions & {
	/** Stable machine-readable reason persisted by the enrichment pipeline. */
	code?: string;
	/** Delay suggested for retrying this item; independent from the breaker. */
	retryAfterMs?: number;
	/** True only when more calls would worsen a provider-wide throttle/block. */
	opensCircuitBreaker?: boolean;
};

export class ProviderTransientError extends Error {
	readonly code: string;
	readonly retryAfterMs?: number;
	readonly opensCircuitBreaker: boolean;

	constructor(message: string, options?: ProviderTransientErrorOptions) {
		super(message, options);
		this.name = "ProviderTransientError";
		this.code = options?.code ?? "provider_unavailable";
		this.retryAfterMs = options?.retryAfterMs;
		this.opensCircuitBreaker = options?.opensCircuitBreaker ?? false;
	}
}

/** A configured credential was explicitly rejected by the upstream API. */
export class ProviderCredentialError extends Error {
	readonly code = "invalid_credentials";

	constructor(
		provider: string,
		readonly status?: 401 | 403,
	) {
		super(
			`${provider} rejected its configured credentials${status ? ` (HTTP ${status})` : ""}`,
		);
		this.name = "ProviderCredentialError";
	}
}

export class ProviderResponseError extends Error {
	readonly code = "invalid_response";

	constructor(provider: string, detail: string, options?: ErrorOptions) {
		super(`${provider} returned an invalid response: ${detail}`, options);
		this.name = "ProviderResponseError";
	}
}

const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 20_000;

function retryAfterMs(response: Response): number | undefined {
	const value = response.headers.get("retry-after")?.trim();
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
	const at = Date.parse(value);
	return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/** Throws ProviderTransientError for rate-limit/server-side statuses (420 is Comicvine's throttle). */
function throwIfTransientStatus(response: Response, provider: string): void {
	const { status } = response;
	if (status === 401 || status === 403) {
		throw new ProviderCredentialError(provider, status);
	}
	if (status === 429 || status === 420 || status >= 500) {
		throw new ProviderTransientError(
			`${provider} is temporarily unavailable (HTTP ${status})`,
			status === 429 || status === 420
				? {
						code: "rate_limited",
						retryAfterMs: retryAfterMs(response) ?? 5 * 60 * 1000,
						opensCircuitBreaker: true,
					}
				: { code: "server_error", retryAfterMs: 30_000 },
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
	timeoutMs = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
): Promise<Response> {
	let response: Response;
	const controller = new AbortController();
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	const upstreamSignal = providerRequestSignal(init?.signal);
	const forwardAbort = () => controller.abort(upstreamSignal?.reason);
	upstreamSignal?.addEventListener("abort", forwardAbort, { once: true });
	if (upstreamSignal?.aborted) forwardAbort();
	try {
		response = await fetch(url, { ...init, signal: controller.signal });
	} catch (error) {
		if (timedOut) {
			throw new ProviderTransientError(`${provider} request timed out`, {
				code: "provider_timeout",
				retryAfterMs: 30_000,
				cause: error,
			});
		}
		throw new ProviderTransientError(
			`${provider} is unreachable: ${(error as Error).message}`,
			{ code: "network_error", retryAfterMs: 15_000, cause: error },
		);
	} finally {
		clearTimeout(timeout);
		upstreamSignal?.removeEventListener("abort", forwardAbort);
	}
	throwIfTransientStatus(response, provider);
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

/**
 * Rivals a provider hands to the pipeline. Only candidates the identity gate
 * cannot reject on search evidence cost a fetch, and the pipeline's hydration
 * budget caps that at 3.
 */
export const CANDIDATE_LIMIT = 5;

// ─── Hydration tail ──────────────────────────────────────

/**
 * Turns a provider's mapped record into a hydrated result, identically for
 * every provider: capture identity evidence while the title is still present,
 * then drop the title (enrichment fills gaps — the local/authority title always
 * wins) and localize the cover only when the book still needs one.
 */
export async function hydratedProviderResult<
	T extends { title?: string | null; cover?: string | null },
>(
	metadata: T,
	input: { uuid?: string; cover?: string | null },
	identity: CatalogIdentityEvidence,
	downloadCover: (
		imageUrl: string,
		uuid: string,
	) => Promise<string | null> = downloadCoverImage,
): Promise<{ metadata: T; identity: CatalogIdentityEvidence }> {
	const cover =
		metadata.cover && !input.cover && input.uuid
			? ((await downloadCover(metadata.cover, input.uuid)) ?? undefined)
			: undefined;
	return {
		metadata: { ...metadata, title: undefined, cover } as T,
		identity,
	};
}

// ─── Cover download ──────────────────────────────────────
// Shared by all providers.

/** Downloads a remote cover into data/covers/<uuid><ext>; returns the cwd-relative path or null. */
export async function downloadCoverImage(
	imageUrl: string,
	uuid: string,
	options?: {
		headers?: Record<string, string>;
		/** Provider-specific veto, e.g. a catalog's "no image" placeholder. */
		accept?: (buffer: Buffer) => Promise<boolean>;
	},
): Promise<string | null> {
	try {
		if (!isSafePublicUrl(imageUrl)) {
			log.warn({ imageUrl }, "Refusing to fetch cover from unsafe URL");
			return null;
		}
		const response = await fetch(imageUrl, {
			redirect: "error",
			headers: options?.headers,
			signal: providerRequestSignal(
				undefined,
				DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
			),
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
		if (!(await isUsableRemoteCover(buffer))) return null;
		if (options?.accept && !(await options.accept(buffer))) return null;

		// Acquire only — the cover-ingest worker normalises it off the scan path.
		const urlExt = path.extname(new URL(imageUrl).pathname);
		return await acquireCover(buffer, uuid, urlExt);
	} catch (error) {
		log.warn({ err: error }, "Cover download failed");
		return null;
	}
}

/** Rejects HTML/error payloads, tracking pixels and visually blank placeholders. */
export async function isUsableRemoteCover(buffer: Buffer): Promise<boolean> {
	try {
		const image = sharp(buffer);
		const [metadata, stats] = await Promise.all([
			image.metadata(),
			image.stats(),
		]);
		const width = metadata.width ?? 0;
		const height = metadata.height ?? 0;
		const mean =
			stats.channels.reduce((sum, channel) => sum + channel.mean, 0) /
			stats.channels.length;
		return (
			width >= 80 &&
			height >= 100 &&
			stats.entropy >= 0.2 &&
			!(mean > 252 && stats.entropy < 0.5)
		);
	} catch {
		return false;
	}
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
