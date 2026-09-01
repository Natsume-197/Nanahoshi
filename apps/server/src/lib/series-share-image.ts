import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { coversDir, tmpDir } from "./paths";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const MAX_COVERS = 3;

type MediaType = "ebook" | "audiobook";

type CoverLayer = {
	input: Buffer;
	left: number;
	top: number;
};

const inFlight = new Map<string, Promise<string | null>>();

function safeCoverPath(filename: string, root: string): string | null {
	if (
		filename !== path.basename(filename) ||
		filename.includes("\\") ||
		filename.includes("\0")
	) {
		return null;
	}
	const resolvedRoot = path.resolve(root);
	const resolved = path.resolve(root, filename);
	return resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : null;
}

async function makeCoverLayer(
	coverPath: string,
	width: number,
	height: number,
	angle: number,
	centerX: number,
	centerY: number,
): Promise<CoverLayer> {
	const input = await sharp(coverPath)
		.rotate()
		.resize(width, height, { fit: "cover", position: "centre" })
		.extend({
			top: 3,
			bottom: 3,
			left: 3,
			right: 3,
			background: { r: 255, g: 255, b: 255, alpha: 0.92 },
		})
		.rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer();
	const metadata = await sharp(input).metadata();
	return {
		input,
		left: Math.round(centerX - (metadata.width ?? width) / 2),
		top: Math.round(centerY - (metadata.height ?? height) / 2),
	};
}

/** Builds the 1200×630 image consumed by Open Graph and Twitter cards. */
export async function composeSeriesShareImage(
	coverPaths: string[],
	mediaType: MediaType,
): Promise<Buffer> {
	const paths = coverPaths.slice(0, MAX_COVERS);
	if (paths.length < 2) {
		throw new Error("A series composite requires at least two covers");
	}

	const background = await sharp(paths[0])
		.rotate()
		.resize(CANVAS_WIDTH, CANVAS_HEIGHT, { fit: "cover" })
		.blur(30)
		.modulate({ brightness: 0.42, saturation: 0.72 })
		.jpeg({ quality: 88 })
		.toBuffer();

	const dimensions =
		mediaType === "audiobook"
			? { width: 390, height: 390 }
			: { width: 310, height: 465 };
	const verticalCenters =
		mediaType === "audiobook" ? [350, 315, 280] : [350, 320, 290];
	const horizontalCenters = paths.length === 2 ? [520, 680] : [440, 600, 760];
	const layouts = paths.map((_, index) => ({
		angle: 0,
		x: horizontalCenters[index] ?? 600,
		y: verticalCenters[index] ?? 315,
	}));

	const layers = await Promise.all(
		paths.map((coverPath, index) => {
			const layout = layouts[index];
			if (!layout) throw new Error("Missing series cover layout");
			return makeCoverLayer(
				coverPath,
				dimensions.width,
				dimensions.height,
				layout.angle,
				layout.x,
				layout.y,
			);
		}),
	);

	const scrim = Buffer.from(
		`<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="rgba(0,0,0,0.16)"/></svg>`,
	);

	// Search presents series as a diagonal deck: later covers recede up and to
	// the right while the first book remains the fully readable foreground card.
	return sharp(background)
		.composite([{ input: scrim, left: 0, top: 0 }, ...layers.reverse()])
		.jpeg({ quality: 88, progressive: true, chromaSubsampling: "4:4:4" })
		.toBuffer();
}

async function createCachedSeriesImage(input: {
	uuid: string;
	mediaType: MediaType;
	coverFilenames: string[];
	coverRoot: string;
	cacheRoot: string;
}): Promise<string | null> {
	const coverPaths = input.coverFilenames
		.slice(0, MAX_COVERS)
		.map((filename) => safeCoverPath(filename, input.coverRoot))
		.filter((coverPath): coverPath is string => coverPath !== null);
	if (coverPaths.length < 2) return null;

	const existing = await Promise.all(
		coverPaths.map(async (coverPath) => {
			try {
				await fs.access(coverPath);
				return coverPath;
			} catch {
				return null;
			}
		}),
	);
	const availablePaths = existing.filter(
		(coverPath): coverPath is string => coverPath !== null,
	);
	if (availablePaths.length < 2) return null;

	const hash = createHash("sha256")
		.update(`${input.mediaType}:${input.coverFilenames.join("|")}`)
		.digest("hex")
		.slice(0, 20);
	const cachePath = path.join(
		input.cacheRoot,
		`series-share-${input.mediaType}-${input.uuid}-${hash}.jpg`,
	);
	try {
		await fs.access(cachePath);
		return cachePath;
	} catch {
		// Cache miss.
	}

	await fs.mkdir(input.cacheRoot, { recursive: true });
	const temporaryPath = `${cachePath}.${randomUUID()}.tmp`;
	try {
		const image = await composeSeriesShareImage(
			availablePaths,
			input.mediaType,
		);
		await fs.writeFile(temporaryPath, image);
		await fs.rename(temporaryPath, cachePath);
		return cachePath;
	} finally {
		await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

export function ensureSeriesShareImage(input: {
	uuid: string;
	mediaType: MediaType;
	coverFilenames: string[];
	coverRoot?: string;
	cacheRoot?: string;
}): Promise<string | null> {
	const uniqueFilenames = [...new Set(input.coverFilenames)].slice(
		0,
		MAX_COVERS,
	);
	const coverRoot = input.coverRoot ?? coversDir;
	const cacheRoot = input.cacheRoot ?? tmpDir;
	const key = `${cacheRoot}:${input.mediaType}:${input.uuid}:${uniqueFilenames.join("|")}`;
	const current = inFlight.get(key);
	if (current) return current;

	const operation = createCachedSeriesImage({
		...input,
		coverFilenames: uniqueFilenames,
		coverRoot,
		cacheRoot,
	}).finally(() => inFlight.delete(key));
	inFlight.set(key, operation);
	return operation;
}
