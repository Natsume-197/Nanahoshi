import path from "node:path";
import { acquireCover, findAcquiredCover } from "../../../../lib/cover-store";
import {
	isSafePublicUrl,
	MAX_REMOTE_IMAGE_BYTES,
} from "../../../../lib/safe-url";
import { CatalogProviderError } from "../../../../modules/catalogEnrichment";

const REQUEST_TIMEOUT_MS = 15_000;

type ProviderLogger = {
	warn: (obj: unknown, msg?: string) => void;
};

/**
 * Throttled JSON fetcher factory — throttle state is per-provider, so each
 * provider creates its own instance with its API's rate limit.
 */
export function createThrottledFetchJson({
	minDelayMs,
	log,
	timeoutMs = REQUEST_TIMEOUT_MS,
}: {
	minDelayMs: number;
	log: ProviderLogger;
	timeoutMs?: number;
}) {
	let lastRequestTime = 0;

	return async function fetchJson<T>(url: string): Promise<T | null> {
		const now = Date.now();
		const elapsed = now - lastRequestTime;
		if (elapsed < minDelayMs) {
			await new Promise((resolve) => setTimeout(resolve, minDelayMs - elapsed));
		}
		lastRequestTime = Date.now();

		let response: Response;
		try {
			response = await fetch(url, {
				signal: AbortSignal.timeout(timeoutMs),
				headers: { Accept: "application/json" },
			});
		} catch (err) {
			log.warn({ err, url }, "Fetch failed");
			const code =
				err instanceof Error &&
				(err.name === "TimeoutError" || err.name === "AbortError")
					? "timeout"
					: "network_error";
			throw new CatalogProviderError("transient", code, { cause: err });
		}
		if (!response.ok) {
			if (response.status === 429) {
				throw new CatalogProviderError("transient", "rate_limited", {
					retryAfterMs: 5 * 60 * 1000,
					opensCircuitBreaker: true,
				});
			}
			if (response.status >= 500) {
				throw new CatalogProviderError("transient", "server_error");
			}
			return null;
		}
		try {
			return (await response.json()) as T;
		} catch (error) {
			throw new CatalogProviderError("permanent", "invalid_response", {
				cause: error,
			});
		}
	};
}

export function stripHtml(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim();
}

export async function downloadCover(
	imageUrl: string,
	bookUuid: string,
	log: ProviderLogger,
): Promise<string | null> {
	try {
		if (!isSafePublicUrl(imageUrl)) {
			log.warn({ imageUrl }, "Refusing to fetch cover from unsafe URL");
			return null;
		}
		// Reuse an already-downloaded cover so re-enrichment doesn't re-fetch it.
		const existing = await findAcquiredCover(bookUuid);
		if (existing) return existing;

		const response = await fetch(imageUrl, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			redirect: "error",
		});
		if (!response.ok) return null;

		const contentLength = Number(response.headers.get("content-length"));
		if (
			Number.isFinite(contentLength) &&
			contentLength > MAX_REMOTE_IMAGE_BYTES
		) {
			log.warn({ contentLength }, "Cover exceeds max size");
			return null;
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		if (buffer.byteLength > MAX_REMOTE_IMAGE_BYTES) return null;

		// Acquire only — the cover-ingest worker normalises it off the scan path.
		const urlExt = path.extname(new URL(imageUrl).pathname);
		return await acquireCover(buffer, bookUuid, urlExt);
	} catch (err) {
		log.warn({ err }, "Failed to download cover");
		return null;
	}
}
