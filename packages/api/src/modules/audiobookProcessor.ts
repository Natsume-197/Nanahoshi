import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { coverColorQueue } from "../infrastructure/queue/queues/cover-color.queue";
import { logger } from "../lib/logger";
import { audiobookMetadataRepository } from "../routers/audiobooks/metadata/metadata.repository";
import { isValidAsin } from "../routers/audiobooks/metadata/providers/IMetadata.provider";
import { authorRepository } from "../routers/authors/author.repository";
import { genreRepository } from "../routers/genres/genre.repository";
import { libraryRepository } from "../routers/libraries/library.repository";
import { narratorRepository } from "../routers/narrators/narrator.repository";
import { seriesRepository } from "../routers/series/series.repository";
import { inferSeriesFromTitle } from "./audiobookSeriesInference";
import {
	type AudioChapter,
	type AudioFileProbeResult,
	isFfprobeAvailable,
	probeAudioFile,
} from "./audioProbe";

const log = logger.child({ component: "audiobook-processor" });

const COVERS_DIR = path.join(process.cwd(), "data/covers");
const COVER_FILENAMES = [
	"cover.jpg",
	"cover.jpeg",
	"cover.png",
	"cover.webp",
	"cover.avif",
	"folder.jpg",
	"folder.jpeg",
	"folder.png",
];

type AudioFileJob = {
	path: string;
	filename: string;
	size: number;
	mtime: number;
	hash: string;
};

export type AudiobookJobData = {
	action: "add-audiobook";
	mediaType: "audiobook";
	dirPath: string;
	filename: string;
	relativePath: string;
	fileHash: string;
	size: number;
	lastModified: string;
	libraryId: number;
	libraryPathId: number;
	taskId?: string;
	/** Author name inferred from folder hierarchy (Audiobookshelf convention) */
	folderAuthorHint?: string | null;
	/** Series name inferred from folder hierarchy */
	folderSeriesHint?: string | null;
	/** Series position extracted from folder/file name */
	folderSeriesPositionHint?: number | null;
	audioFiles: AudioFileJob[];
};

type ProbeResult = {
	file: AudioFileJob;
	probe: AudioFileProbeResult;
};

// Process an audiobook job: probe files, insert metadata + audio_file rows +
// chapters, and extract cover art.
export async function processAudiobook(
	bookId: number,
	bookUuid: string,
	data: AudiobookJobData,
): Promise<void> {
	if (!isFfprobeAvailable()) {
		throw new Error("ffprobe is not available. Cannot process audiobook.");
	}

	// 1. Probe all audio files in parallel
	const probeResults = await probeAllFiles(data.audioFiles);
	const firstProbeResult = probeResults[0];
	if (!firstProbeResult) {
		throw new Error(`No audio files could be probed for ${data.filename}`);
	}

	// 2. Aggregate metadata from probes
	const aggregated = aggregateMetadata(probeResults);

	// 3. Extract metadata from tags (title, authors, narrators, etc.)
	const tagMetadata = extractTagMetadata(probeResults, data.filename);

	// 4. Find or extract cover art
	const coverPath = await findOrExtractCover(
		data.dirPath,
		firstProbeResult.file.path,
		bookUuid,
	);

	// 5. Insert audiobook_metadata
	await audiobookMetadataRepository.insertMetadata({
		bookId,
		title: tagMetadata.title,
		subtitle: null,
		description: tagMetadata.description,
		publishedDate: tagMetadata.date,
		languageCode: tagMetadata.language,
		isbn: null,
		asin: tagMetadata.asin,
		cover: coverPath,
		duration: aggregated.totalDuration,
		codec: aggregated.codec,
		bitRate: aggregated.bitRate,
		channels: aggregated.channels,
		sampleRate: aggregated.sampleRate,
		explicit: null,
		abridged: null,
		publisherId: null,
		ebookFile: null,
	});

	// 6. Insert audio_file rows
	const audioFileRows = probeResults.map((r, index) => ({
		bookId,
		index,
		filename: r.file.filename,
		path: r.file.path,
		filesize: r.file.size,
		duration: r.probe.duration,
		codec: r.probe.codec,
		bitRate: r.probe.bitRate,
		channels: r.probe.channels,
		sampleRate: r.probe.sampleRate,
		format: r.probe.format,
		mimeType: r.probe.mimeType,
		discNumber:
			parseIntTag(r.probe.tags.disc) ?? parseIntTag(r.probe.tags.discnumber),
		trackNumber:
			parseIntTag(r.probe.tags.track) ?? parseIntTag(r.probe.tags.tracknumber),
		metaTags: r.probe.tags,
	}));

	await audiobookMetadataRepository.insertAudioFiles(audioFileRows);

	// 7. Insert chapters
	const chapters = buildChapters(probeResults);
	await audiobookMetadataRepository.insertChapters(
		chapters.map((ch) => ({ ...ch, bookId })),
	);

	// Catalog entities (author/narrator/genre/series) are scoped per-server.
	const serverId = await libraryRepository.getServerIdByLibraryId(
		data.libraryId,
	);
	if (!serverId) {
		throw new Error(`No server found for library ${data.libraryId}`);
	}

	// 8. Insert authors (from tags, or fallback to folder-based hint)
	const resolvedAuthors =
		tagMetadata.authors.length > 0
			? tagMetadata.authors
			: data.folderAuthorHint
				? [data.folderAuthorHint]
				: [];

	for (const authorName of resolvedAuthors) {
		const authorId = await authorRepository.upsertByName(authorName, serverId);
		await audiobookMetadataRepository.linkAuthor(bookId, authorId, "Author");
	}

	// 9. Insert narrators
	if (tagMetadata.narrators.length > 0) {
		for (const narratorName of tagMetadata.narrators) {
			const narratorId = await narratorRepository.upsertByName(
				narratorName,
				serverId,
			);
			await audiobookMetadataRepository.linkNarrator(bookId, narratorId);
		}
	}

	// 10. Insert genres
	if (tagMetadata.genres.length > 0) {
		for (const genreName of tagMetadata.genres) {
			const genreId = await genreRepository.upsertByName(genreName, serverId);
			await audiobookMetadataRepository.linkGenre(bookId, genreId);
		}
	}

	// 11. Insert series (tags → folder hint → volume marker in the title or
	// filename — album tags often drop the "[1巻]" prefix the filename carries)
	const inferredSeries =
		inferSeriesFromTitle(tagMetadata.title) ??
		inferSeriesFromTitle(cleanDirectoryName(data.filename));
	const resolvedSeriesName =
		tagMetadata.seriesName ??
		data.folderSeriesHint ??
		inferredSeries?.seriesName ??
		null;
	const resolvedSeriesPosition =
		tagMetadata.seriesPosition ??
		data.folderSeriesPositionHint ??
		inferredSeries?.position ??
		null;

	if (resolvedSeriesName) {
		// Explicit names (tags/folder) upsert as-is; inferred names go through
		// common-prefix resolution so multi-subtitle volumes share one series.
		const fromInference =
			tagMetadata.seriesName == null && data.folderSeriesHint == null;
		const seriesId = fromInference
			? (
					await audiobookMetadataRepository.resolveInferredSeries(
						resolvedSeriesName,
						serverId,
					)
				).id
			: await seriesRepository.upsertByName(resolvedSeriesName, serverId);
		await audiobookMetadataRepository.linkSeries(
			bookId,
			seriesId,
			resolvedSeriesPosition,
		);
	}

	// 12. Enqueue cover color extraction
	if (coverPath) {
		await coverColorQueue
			.add(
				"extract",
				{ bookId, coverPath, mediaType: "audiobook" as const },
				{ removeOnComplete: true, removeOnFail: 100 },
			)
			.catch(() => {});
	}
}

// ── Probe helpers ────────────────────────────────────────────────────────────

async function probeAllFiles(files: AudioFileJob[]): Promise<ProbeResult[]> {
	const results: ProbeResult[] = [];

	for (const file of files) {
		try {
			const probe = await probeAudioFile(file.path);
			results.push({ file, probe });
		} catch (err) {
			log.warn({ err, filename: file.filename }, "Failed to probe audio file");
		}
	}

	return results;
}

type AggregatedMeta = {
	totalDuration: number;
	codec: string | null;
	bitRate: number | null;
	channels: number | null;
	sampleRate: number | null;
};

function aggregateMetadata(probeResults: ProbeResult[]): AggregatedMeta {
	const totalDuration = probeResults.reduce(
		(sum, r) => sum + r.probe.duration,
		0,
	);

	// Use values from the first successfully probed file as representative
	const first = probeResults[0]?.probe;
	if (!first) {
		throw new Error("aggregateMetadata requires at least one probe result");
	}

	return {
		totalDuration,
		codec: first.codec,
		bitRate: first.bitRate,
		channels: first.channels,
		sampleRate: first.sampleRate,
	};
}

// ── Tag metadata extraction ──────────────────────────────────────────────────

type TagMetadata = {
	title: string | null;
	description: string | null;
	date: string | null;
	language: string | null;
	asin: string | null;
	authors: string[];
	narrators: string[];
	genres: string[];
	seriesName: string | null;
	seriesPosition: number | null;
};

function extractTagMetadata(
	probeResults: ProbeResult[],
	directoryName: string,
): TagMetadata {
	// Use tags from the first file (most likely to have album-level metadata)
	const tags = probeResults[0]?.probe.tags ?? {};

	const title = tags.album || tags.title || cleanDirectoryName(directoryName);
	const description = tags.comment ?? tags.description ?? null;
	const rawDate = tags.date ?? tags.year ?? null;
	// Normalize to valid ISO date — a bare year like "2017" becomes "2017-01-01"
	const date = rawDate
		? /^\d{4}$/.test(rawDate)
			? `${rawDate}-01-01`
			: rawDate
		: null;
	const language = tags.language ?? null;

	// Authors: "artist" or "album_artist" tag, split by separators
	const authorRaw = tags.album_artist || tags.albumartist || tags.artist || "";
	const authors = splitTagValue(authorRaw);

	// Narrators: "narrator" or "composer" tag (audiobookshelf convention)
	const narratorRaw = tags.narrator || tags.narrated_by || tags.composer || "";
	const narrators = splitTagValue(narratorRaw);

	// Genres
	const genreRaw = tags.genre || "";
	const genres = splitTagValue(genreRaw);

	// ASIN: Audible rips carry it in tags (audiobookshelf convention: "asin";
	// Audible's own files use CDEK). Enables direct Audnexus enrichment.
	const asinRaw = tags.asin || tags.ASIN || tags.CDEK || tags.cdek || null;
	const asin = isValidAsin(asinRaw) ? asinRaw.trim().toUpperCase() : null;

	// Series: some audiobooks store series info in tags
	const seriesName =
		tags.series || tags["series-part"] ? (tags.series ?? null) : null;
	const seriesPositionRaw = tags["series-part"] || tags.movement || null;
	const seriesPosition = seriesPositionRaw
		? Number.parseInt(seriesPositionRaw, 10) || null
		: null;

	return {
		title,
		description,
		date,
		language,
		asin,
		authors,
		narrators,
		genres,
		seriesName,
		seriesPosition,
	};
}

function cleanDirectoryName(name: string): string {
	// Remove file extension if it's a standalone file
	return name.replace(/\.[^.]+$/, "");
}

function splitTagValue(value: string): string[] {
	if (!value.trim()) return [];
	// Split on common separators: ;  /  ,  &  (but not inside names like "J.K. Rowling")
	return value
		.split(/[;/]|,\s+|\s+&\s+/)
		.map((s) => s.trim())
		.filter(Boolean);
}

// ── Chapter building ─────────────────────────────────────────────────────────

type ChapterRow = {
	index: number;
	title: string | null;
	startTime: number;
	endTime: number;
};

function buildChapters(probeResults: ProbeResult[]): ChapterRow[] {
	// If the first file has embedded chapters (M4B), use those
	const firstProbe = probeResults[0];
	if (!firstProbe) return [];
	if (firstProbe.probe.chapters.length > 0) {
		// For single-file audiobooks (M4B), use embedded chapters directly
		if (probeResults.length === 1) {
			return firstProbe.probe.chapters.map(chapterToRow);
		}

		// For multi-file, only use embedded chapters from the first file
		// and generate the rest from file durations
		// In practice, multi-file audiobooks rarely have embedded chapters
	}

	// For multi-file audiobooks: generate one chapter per file
	if (probeResults.length > 1) {
		const chapters: ChapterRow[] = [];
		let offset = 0;

		for (const [i, r] of probeResults.entries()) {
			const title =
				r.probe.tags.title || r.file.filename.replace(/\.[^.]+$/, "");

			chapters.push({
				index: i,
				title,
				startTime: offset,
				endTime: offset + r.probe.duration,
			});

			offset += r.probe.duration;
		}

		return chapters;
	}

	// Single file without chapters — no chapter data to insert
	return [];
}

function chapterToRow(ch: AudioChapter): ChapterRow {
	return {
		index: ch.index,
		title: ch.title,
		startTime: ch.startTime,
		endTime: ch.endTime,
	};
}

// ── Cover art ────────────────────────────────────────────────────────────────

async function findOrExtractCover(
	dirPath: string,
	firstAudioFilePath: string,
	bookUuid: string,
): Promise<string | null> {
	await fs.mkdir(COVERS_DIR, { recursive: true });

	// 1. Check for cover image files in the directory
	for (const coverName of COVER_FILENAMES) {
		const candidatePath = path.join(dirPath, coverName);
		try {
			await fs.access(candidatePath);
			return await saveCover(candidatePath, bookUuid);
		} catch {
			// File doesn't exist, try next
		}
	}

	// 2. Try to extract embedded cover art from the first audio file using ffmpeg
	return await extractEmbeddedCover(firstAudioFilePath, bookUuid);
}

async function saveCover(
	sourcePath: string,
	bookUuid: string,
): Promise<string | null> {
	try {
		const outputPath = path.join(COVERS_DIR, `${bookUuid}.avif`);

		await sharp(sourcePath)
			.resize(800, 800, {
				fit: "inside",
				withoutEnlargement: true,
			})
			.avif({ quality: 65, effort: 4 })
			.toFile(outputPath);

		return path.relative(process.cwd(), outputPath);
	} catch (err) {
		log.warn({ err }, "Failed to save cover");
		return null;
	}
}

async function extractEmbeddedCover(
	audioFilePath: string,
	bookUuid: string,
): Promise<string | null> {
	try {
		const tmpPath = path.join(COVERS_DIR, `${bookUuid}_tmp.jpg`);
		const outputPath = path.join(COVERS_DIR, `${bookUuid}.avif`);

		// ffmpeg extracts embedded artwork (video stream in audio containers)
		const proc = Bun.spawn(
			[
				"ffmpeg",
				"-i",
				audioFilePath,
				"-an",
				"-vcodec",
				"mjpeg",
				"-frames:v",
				"1",
				"-y",
				tmpPath,
			],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);

		const exitCode = await Promise.race([
			proc.exited,
			new Promise<never>((_, reject) =>
				setTimeout(() => {
					proc.kill();
					reject(new Error("ffmpeg cover extraction timed out"));
				}, 15_000),
			),
		]);

		if (exitCode !== 0) {
			await fs.unlink(tmpPath).catch(() => {});
			return null;
		}

		// Verify the extracted file is not empty
		const stat = await fs.stat(tmpPath).catch(() => null);
		if (!stat || stat.size === 0) {
			await fs.unlink(tmpPath).catch(() => {});
			return null;
		}

		await sharp(tmpPath)
			.resize(800, 800, {
				fit: "inside",
				withoutEnlargement: true,
			})
			.avif({ quality: 65, effort: 4 })
			.toFile(outputPath);

		await fs.unlink(tmpPath).catch(() => {});
		return path.relative(process.cwd(), outputPath);
	} catch {
		return null;
	}
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

function parseIntTag(value: string | undefined): number | null {
	if (!value) return null;
	// Handle "1/12" format (track/total)
	const num = Number.parseInt(value.split("/")[0] ?? "", 10);
	return Number.isNaN(num) ? null : num;
}
