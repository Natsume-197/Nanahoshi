import * as fs from "node:fs/promises";
import path from "node:path";
import {
	isSafePublicUrl,
	MAX_REMOTE_IMAGE_BYTES,
} from "../../../../lib/safe-url";
import { CatalogProviderError } from "../../../../modules/catalogEnrichment";

const COVERS_DIR = path.join(process.cwd(), "data/covers");
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
				throw new CatalogProviderError("transient", "rate_limited");
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
		await fs.mkdir(COVERS_DIR, { recursive: true });
		const outputPath = path.join(COVERS_DIR, `${bookUuid}.avif`);

		// Reuse an already-downloaded cover, including the legacy webp name so
		// re-enrichment of pre-AVIF books doesn't re-download and duplicate it.
		const legacyPath = path.join(COVERS_DIR, `${bookUuid}.webp`);
		for (const candidate of [outputPath, legacyPath]) {
			try {
				await fs.access(candidate);
				return path.relative(process.cwd(), candidate);
			} catch {
				// doesn't exist yet
			}
		}

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

		const sharp = (await import("sharp")).default;
		await sharp(buffer)
			.resize(800, 800, { fit: "inside", withoutEnlargement: true })
			.avif({ quality: 65, effort: 4 })
			.toFile(outputPath);

		return path.relative(process.cwd(), outputPath);
	} catch (err) {
		log.warn({ err }, "Failed to download cover");
		return null;
	}
}
