import * as fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DATA_DIR = path.join(process.cwd(), "data");

export const coversDir = path.join(DATA_DIR, "covers");
export const coverCacheDir = path.join(DATA_DIR, "tmp");

// Requested sizes/qualities snap to a fixed set so the unauthenticated resize
// cache can only ever hold a bounded number of files per cover.
export const ALLOWED_DIMS = [
	64, 128, 200, 300, 400, 600, 800, 1200, 2048,
] as const;
const MAX_COVER_DIM = 2048;
export const ALLOWED_QUALITIES = [50, 60, 75, 86, 95] as const;

// AVIF-scale buckets: quality numbers don't compare across codecs (avif 60 ≈
// webp 90). The jpeg fallback maps each bucket to its equivalent.
const JPEG_QUALITY: Record<number, number> = {
	50: 78,
	60: 85,
	75: 92,
	86: 95,
	95: 97,
};
const MAX_QUALITY = Math.max(...ALLOWED_QUALITIES);

export type CoverFormat = "avif" | "jpeg";

// Mirrors `coverPresets` defaults and COVER_AVIF_QUALITY in
// apps/web/src/utils/covers.ts. A width the client never requests is pure
// wasted encode; one that isn't an ALLOWED_DIMS bucket snaps elsewhere on read
// and is never served at all.
export const WARM_WIDTHS = [128, 300, 400, 600] as const;
export const WARM_QUALITY = 95;
const WARM_FORMAT: CoverFormat = "avif";

export function snapDim(n: number): number {
	if (!Number.isFinite(n) || n <= 0) return 0;
	return ALLOWED_DIMS.find((d) => d >= n) ?? MAX_COVER_DIM;
}

export function snapQuality(n: number): number {
	if (!Number.isFinite(n)) return 60;
	// Above the top bucket, clamp up: falling back to the default would answer
	// a request for *more* quality with markedly less.
	return ALLOWED_QUALITIES.find((q) => q >= n) ?? MAX_QUALITY;
}

/**
 * The serve route and the warm worker must produce byte-identical paths or
 * pre-generated variants are written where nothing ever reads them.
 */
export function coverCacheFile(
	filename: string,
	width: number,
	height: number,
	quality: number,
	format: CoverFormat,
): string {
	const base = path.basename(filename, path.extname(filename));
	return `${base}-${width || 0}_${height || 0}_q${quality}_v3.${format}`;
}

let cacheDirReady: Promise<unknown> | null = null;

export type CoverVariant = {
	imagePath: string;
	width: number;
	height?: number;
	quality: number;
	format: CoverFormat;
	cacheDir?: string;
};

/**
 * Returns the cache path for a variant, rendering it if absent. Both the serve
 * route and the warm worker go through here so a variant is looked up, written
 * and cleaned up identically — a failed encode must never leave a truncated
 * file, which every later request would serve as a cache hit.
 */
export async function ensureCoverVariant(
	v: CoverVariant,
): Promise<{ cachePath: string; rendered: boolean }> {
	const cacheDir = v.cacheDir ?? coverCacheDir;
	if (cacheDir === coverCacheDir) {
		cacheDirReady ??= fs.mkdir(cacheDir, { recursive: true });
		await cacheDirReady;
	} else {
		await fs.mkdir(cacheDir, { recursive: true });
	}

	const cachePath = path.join(
		cacheDir,
		coverCacheFile(v.imagePath, v.width, v.height ?? 0, v.quality, v.format),
	);
	if (await exists(cachePath)) return { cachePath, rendered: false };

	try {
		await renderCoverVariant(v, cachePath);
	} catch (err) {
		await fs.unlink(cachePath).catch(() => {});
		throw err;
	}
	return { cachePath, rendered: true };
}

export async function warmCoverVariants(
	imagePath: string,
	cacheDir?: string,
): Promise<{ warmed: number; failed: number }> {
	let warmed = 0;
	let failed = 0;
	for (const width of WARM_WIDTHS) {
		try {
			const { rendered } = await ensureCoverVariant({
				imagePath,
				width,
				quality: WARM_QUALITY,
				format: WARM_FORMAT,
				cacheDir,
			});
			if (rendered) warmed++;
		} catch {
			failed++;
		}
	}
	return { warmed, failed };
}

async function exists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

async function renderCoverVariant(
	v: CoverVariant,
	cachePath: string,
): Promise<void> {
	let pipeline = sharp(v.imagePath);
	if (v.width || v.height) {
		pipeline = pipeline.resize(v.width || undefined, v.height || undefined, {
			kernel: sharp.kernel.lanczos3,
			fit: "inside",
			withoutEnlargement: true,
		});
	}
	if (v.format === "jpeg") {
		pipeline = pipeline.jpeg({ quality: JPEG_QUALITY[v.quality] ?? 85 });
	} else {
		// effort 1: matches the old webp encode speed on low-power hosts at
		// ~equal PSNR/size to effort 3 for these widths (effort 0 degrades).
		pipeline = pipeline.avif({ quality: v.quality, effort: 1 });
	}
	await pipeline.toFile(cachePath);
}
