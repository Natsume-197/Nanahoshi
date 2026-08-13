/**
 * Cover Ingest: the only code allowed to decide what a stored cover *is*.
 *
 * Acquisition and ingest are deliberately separate steps. Acquiring is what
 * happens on the scan path — pull bytes out of an EPUB, a download or ffmpeg
 * and write them down, nothing more. Ingest is what turns those bytes into a
 * Cover Master, and it runs on the worker process because it is the expensive
 * half: encoding a 1600px cover used to cost 26.7s inside audiobook processing.
 *
 * The master carries its own resolution in its filename (`<uuid>_w1350.jpg`).
 * That is what lets the Rendition Ladder truncate honestly without threading a
 * width column through every catalog query in the codebase — the one string
 * that already travels everywhere describes itself.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { COVER_STORE_MAX_DIM } from "./cover-ladder";
import { logger } from "./logger";

const log = logger.child({ component: "cover-store" });

export const coversDir = path.join(process.cwd(), "data", "covers");

/**
 * The master is JPEG, not AVIF, even though every *served* rendition is AVIF.
 * Measured over real covers at the 1600px ceiling: mozjpeg q92 writes in 570ms
 * against 633ms for the fastest usable AVIF, lands smaller (344KB vs 403KB),
 * and — because the serve route decodes it again for every rendition — decodes
 * 40% faster (367ms vs 607ms to produce a 400px AVIF). AVIF is asymmetric by
 * design: cheap to decode, expensive to encode. That trade is right for bytes
 * on the wire and wrong for an intermediate that exists to be re-read.
 */
const MASTER_QUALITY = 92;

/** Cover art is dense with small coloured type — Japanese titles especially.
 * 4:2:0 smears exactly that, and this file is the ceiling on every rendition
 * below it, so the ~15% extra bytes buy sharpness that cannot be recovered. */
const MASTER_SUBSAMPLING = "4:4:4";

/** libvips segfaults on some SVGs (unaligned chunk), and animated GIFs have no
 * meaningful single frame. Both are left exactly as acquired: no master, no
 * width in the name, so the ladder falls back to its full declared set. */
const UNINGESTIBLE = new Set([".svg", ".gif"]);

/** Below this, re-encoding a conformant JPEG costs ~570ms to save nothing. */
const PASSTHROUGH_MAX_BYTES = 500_000;

export type CoverMaster = {
	/** cwd-relative, as stored in the `cover` column. */
	path: string;
	width: number;
	height: number;
	/** False when the source was already conformant and was merely renamed. */
	reencoded: boolean;
};

let coversDirReady: Promise<unknown> | null = null;

async function ensureCoversDir(): Promise<void> {
	coversDirReady ??= fs.mkdir(coversDir, { recursive: true });
	await coversDirReady;
}

/**
 * Writes acquired bytes down as-is. This is what runs on the scan path, and it
 * must stay cheap — no decode, no re-encode, no metadata probe.
 */
export async function acquireCover(
	bytes: Buffer,
	uuid: string,
	ext: string,
): Promise<string | null> {
	await ensureCoversDir();
	const safeExt = normalizeExt(ext);
	const target = path.join(coversDir, `${uuid}${safeExt}`);
	// `wx` so a re-run never truncates art another process is already serving.
	await fs.writeFile(target, bytes, { flag: "wx" }).catch(() => {});
	return path.relative(process.cwd(), target);
}

/**
 * Replaces previously acquired bytes after a deliberate local-cover repair.
 * The temporary sibling plus rename keeps readers from observing a partial
 * write; callers must opt in because ordinary enrichment remains immutable.
 */
export async function replaceAcquiredCover(
	bytes: Buffer,
	uuid: string,
	ext: string,
): Promise<string | null> {
	await ensureCoversDir();
	const safeExt = normalizeExt(ext);
	const target = path.join(coversDir, `${uuid}${safeExt}`);
	const staging = `${target}.${randomUUID()}.replace`;
	try {
		await fs.writeFile(staging, bytes, { flag: "wx" });
		await fs.rename(staging, target);
		return path.relative(process.cwd(), target);
	} catch (err) {
		await fs.unlink(staging).catch(() => {});
		log.warn({ err, target }, "Cover replacement failed");
		return null;
	}
}

/** Extensions a cover can arrive as, in the order a duplicate is most likely to
 * already be sitting on disk under. */
const ACQUIRED_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"];

/**
 * An already-acquired file for this key, if any — so re-enrichment does not
 * re-download art we already hold. Deliberately a fixed candidate list rather
 * than a directory scan: `data/covers` holds tens of thousands of files.
 */
export async function findAcquiredCover(uuid: string): Promise<string | null> {
	for (const ext of ACQUIRED_EXTS) {
		const candidate = path.join(coversDir, `${uuid}${ext}`);
		try {
			await fs.access(candidate);
			return path.relative(process.cwd(), candidate);
		} catch {
			// try the next extension
		}
	}
	return null;
}

/** Same contract as `acquireCover`, for bytes that are already a file on disk
 * (a cover image sitting next to the audio files, ffmpeg's output). */
export async function acquireCoverFromFile(
	sourcePath: string,
	uuid: string,
): Promise<string | null> {
	await ensureCoversDir();
	const safeExt = normalizeExt(path.extname(sourcePath));
	const target = path.join(coversDir, `${uuid}${safeExt}`);
	try {
		await fs.access(target);
		return path.relative(process.cwd(), target);
	} catch {
		// not acquired yet
	}
	try {
		await fs.copyFile(sourcePath, target);
		return path.relative(process.cwd(), target);
	} catch (err) {
		log.warn({ err, sourcePath }, "Cover acquire failed");
		return null;
	}
}

/**
 * Turns an acquired file into a Cover Master: bounded, single-format, and named
 * after its real width. Returns null when the source cannot be a master, in
 * which case the acquired file stays exactly where it is.
 *
 * Idempotent — a file that is already a master is returned unchanged, so a
 * re-queued job or a backfill sweep costs one metadata probe.
 */
export async function ingestCover(
	coverPath: string,
	uuid: string,
): Promise<CoverMaster | null> {
	const sourcePath = path.resolve(process.cwd(), coverPath);
	const ext = path.extname(sourcePath).toLowerCase();
	if (UNINGESTIBLE.has(ext)) return null;

	const meta = await sharp(sourcePath)
		.metadata()
		.catch((err: unknown) => {
			log.warn({ err, sourcePath }, "Cover is not a readable image");
			return null;
		});
	if (!meta) return null;

	const width = meta.width ?? 0;
	const height = meta.height ?? 0;
	if (!width || !height) return null;

	const longEdge = Math.max(width, height);
	const scale =
		longEdge > COVER_STORE_MAX_DIM ? COVER_STORE_MAX_DIM / longEdge : 1;
	const outWidth = Math.round(width * scale);
	const outHeight = Math.round(height * scale);

	await ensureCoversDir();

	// sharp only reports `size` for Buffer/Stream input, so ask the filesystem.
	const bytes = await fs.stat(sourcePath).then(
		(s) => s.size,
		() => Number.POSITIVE_INFINITY,
	);
	const conformant =
		scale === 1 &&
		(meta.format === "jpeg" || meta.format === "heif") &&
		bytes <= PASSTHROUGH_MAX_BYTES;

	const outExt = conformant ? ext : ".jpg";
	const masterPath = path.join(coversDir, masterName(uuid, outWidth, outExt));

	if (masterPath === sourcePath) {
		return { path: coverPath, width, height, reencoded: false };
	}

	if (conformant) {
		await fs.rename(sourcePath, masterPath);
		return {
			path: path.relative(process.cwd(), masterPath),
			width: outWidth,
			height: outHeight,
			reencoded: false,
		};
	}

	// Encode beside the target and move into place, so a crash mid-encode never
	// leaves a truncated file that every later request serves as a valid master.
	const stagingPath = `${masterPath}.ingest`;
	try {
		await sharp(sourcePath)
			.resize(outWidth, outHeight, {
				kernel: sharp.kernel.lanczos3,
				fit: "inside",
				withoutEnlargement: true,
			})
			.flatten({ background: "#ffffff" })
			.jpeg({
				quality: MASTER_QUALITY,
				mozjpeg: true,
				chromaSubsampling: MASTER_SUBSAMPLING,
			})
			.toFile(stagingPath);
		await fs.rename(stagingPath, masterPath);
	} catch (err) {
		await fs.unlink(stagingPath).catch(() => {});
		log.warn({ err, sourcePath }, "Cover ingest failed");
		return null;
	}

	await fs.unlink(sourcePath).catch(() => {});
	return {
		path: path.relative(process.cwd(), masterPath),
		width: outWidth,
		height: outHeight,
		reencoded: true,
	};
}

export function masterName(uuid: string, width: number, ext: string): string {
	return `${uuid}_w${width}${ext}`;
}

/** The stable identity of a cover, with any resolution marker stripped — so
 * re-ingesting a master re-derives the same name instead of stacking markers. */
export function coverKeyFromPath(coverPath: string): string {
	const base = path.basename(coverPath, path.extname(coverPath));
	return base.replace(/_w\d{2,5}$/, "");
}

function normalizeExt(ext: string): string {
	const lower = ext.toLowerCase();
	return lower && lower !== "." && /^\.[a-z0-9]{1,5}$/.test(lower)
		? lower
		: ".jpg";
}

/**
 * Amazon's image CDN encodes the rendition in the filename
 * (`...._SL500_.jpg`), and Audnexus hands us the 500px one. Asking for a larger
 * rendition returns the native size when the source is smaller, so this only
 * ever gains pixels. URLs with no modifier are already full-size.
 */
export function upgradeAmazonImageUrl(url: string): string {
	return url.replace(
		/\._(?:SL|SX|SY|SS|UX|UY|CR|AC)([\d,]*)_\./,
		(match, dims: string) => {
			const largest = Math.max(
				0,
				...dims
					.split(",")
					.map(Number)
					.filter((n) => Number.isFinite(n)),
			);
			// Only ever widen: a URL already asking for more than we store would
			// lose pixels if we rewrote it down to our own ceiling.
			return largest >= COVER_STORE_MAX_DIM
				? match
				: `._SL${COVER_STORE_MAX_DIM}_.`;
		},
	);
}
