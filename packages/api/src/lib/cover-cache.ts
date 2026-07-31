import * as fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
	coverLadder,
	DEFERRED_WARM_WIDTHS,
	masterWidthFromFilename,
	WARM_QUALITY,
	WARM_WIDTHS,
} from "./cover-ladder";

const DATA_DIR = path.join(process.cwd(), "data");

export const coversDir = path.join(DATA_DIR, "covers");
export const coverCacheDir = path.join(DATA_DIR, "tmp");

export {
	ALLOWED_DIMS,
	ALLOWED_QUALITIES,
	DEFERRED_WARM_WIDTHS,
	snapDim,
	snapQuality,
	WARM_QUALITY,
	WARM_WIDTHS,
} from "./cover-ladder";

// AVIF-scale buckets: quality numbers don't compare across codecs (avif 60 ≈
// webp 90). The jpeg fallback maps each bucket to its equivalent.
const JPEG_QUALITY: Record<number, number> = {
	50: 78,
	60: 85,
	75: 92,
	86: 95,
	95: 97,
};

export type CoverFormat = "avif" | "jpeg";

const WARM_FORMAT: CoverFormat = "avif";

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
	const cacheDir = await resolveCacheDir(v.cacheDir);

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

/**
 * A already-rendered variant narrower than the one requested, if there is one.
 *
 * This is what keeps encoding off the request path. A cold 1200px cover costs
 * 2.25s to encode, and the presets ask for widths the warm set deliberately
 * does not cover, so a detail page would otherwise stall on every first view.
 * Serving a narrower rendition immediately — uncached, so the browser comes
 * back for the real one — trades a moment of softness for that stall.
 */
export async function findWarmFallback(
	imagePath: string,
	width: number,
	quality: number,
	format: CoverFormat,
	cacheDir?: string,
): Promise<string | null> {
	const dir = await resolveCacheDir(cacheDir);
	const candidates = [...WARM_WIDTHS, ...DEFERRED_WARM_WIDTHS]
		.filter((w) => w < width)
		.sort((a, b) => b - a);

	for (const candidate of candidates) {
		const candidatePath = path.join(
			dir,
			coverCacheFile(imagePath, candidate, 0, quality, format),
		);
		if (await exists(candidatePath)) return candidatePath;
	}
	return null;
}

/**
 * Pre-renders the warm rungs a given cover can actually answer for. A master
 * narrower than a rung would answer it with fewer pixels than the name claims,
 * so the ladder truncates rather than writing a mislabelled duplicate.
 */
export async function warmCoverVariants(
	imagePath: string,
	cacheDir?: string,
): Promise<{ warmed: number; failed: number }> {
	let warmed = 0;
	let failed = 0;
	const widths = coverLadder(
		WARM_WIDTHS,
		masterWidthFromFilename(path.basename(imagePath)),
	);
	for (const width of widths) {
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

async function resolveCacheDir(cacheDir?: string): Promise<string> {
	const dir = cacheDir ?? coverCacheDir;
	if (dir === coverCacheDir) {
		cacheDirReady ??= fs.mkdir(dir, { recursive: true });
		await cacheDirReady;
	} else {
		await fs.mkdir(dir, { recursive: true });
	}
	return dir;
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
