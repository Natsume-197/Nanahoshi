import * as fs from "node:fs/promises";
import path from "node:path";

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

		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(timeoutMs),
				headers: { Accept: "application/json" },
			});
			if (!response.ok) {
				if (response.status === 429) {
					log.warn("Rate limited, backing off");
					await new Promise((r) => setTimeout(r, 5000));
					return null;
				}
				return null;
			}
			return (await response.json()) as T;
		} catch (err) {
			log.warn({ err, url }, "Fetch failed");
			return null;
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
		await fs.mkdir(COVERS_DIR, { recursive: true });
		const outputPath = path.join(COVERS_DIR, `${bookUuid}.webp`);

		try {
			await fs.access(outputPath);
			return path.relative(process.cwd(), outputPath);
		} catch {
			// doesn't exist yet
		}

		const response = await fetch(imageUrl, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) return null;

		const buffer = Buffer.from(await response.arrayBuffer());

		const sharp = (await import("sharp")).default;
		await sharp(buffer)
			.resize(800, 800, { fit: "inside", withoutEnlargement: true })
			.webp({ quality: 90, effort: 5 })
			.toFile(outputPath);

		return path.relative(process.cwd(), outputPath);
	} catch (err) {
		log.warn({ err }, "Failed to download cover");
		return null;
	}
}
