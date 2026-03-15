import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@nanahoshi-v2/db";
import { scannedFile } from "@nanahoshi-v2/db/schema/general";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import fg from "fast-glob";
import { fileEventQueue } from "../infrastructure/queue/queues/file-event.queue";
import {
	calculateContentHash,
	calculateMetadataHash,
	formatBytes,
} from "../utils/misc";
import { needsConversion } from "./conversion/converter";
import { incrementTotalJobs } from "./taskManager";

// TODO: Add support to azw, mobi, pdf, cbz, cbr (maybe more?)
const SUPPORTED_EXTENSIONS = ["epub", "azw3"];
const GLOB_PATTERN = SUPPORTED_EXTENSIONS.map((ext) => `**/*.${ext}`);
const DB_BATCH_SIZE = 10000;
const JOB_BATCH_SIZE = 10000;
const PARALLEL_CONTENT_HASH = 50;
const PARALLEL_STAT = 200;
type DuplicateFile = {
	path: string;
	size: number;
	libraryPathId: number;
};
type DuplicateReportEntry = {
	hash: string;
	count: number;
	size: number;
	sizeFormatted: string;
	wastedSpace: number;
	wastedSpaceFormatted: string;
	files: Array<{
		path: string;
		status: string;
		mtime: string;
	}>;
};

export async function scanPathLibrary(
	rootDir: string,
	libraryId: number,
	libraryPathId: number,
	taskId?: string,
) {
	console.time("scanLibrary");

	const normalizedRootDir = path.normalize(rootDir);
	console.log(`≫ Starting path library scan for ${normalizedRootDir}`);

	let batchFilesDb: {
		path: string;
		libraryPathId: number;
		size: number;
		mtime: Date;
		status: string;
		hash: string;
	}[] = [];
	let jobsCreated = 0;
	let scannedCount = 0;
	const scannedPaths = new Set<string>();

	// Get all the entries from a directory recursively
	const entries = fg.stream(GLOB_PATTERN, {
		cwd: normalizedRootDir,
		absolute: true,
		suppressErrors: true,
		onlyFiles: true,
		dot: false,
	});

	// Step 1: Generate hashes from stats (metadata of a file)
	// And insert the raw data of the file to the database
	// Uses parallel fs.stat() calls for significantly better I/O throughput
	console.log("≫ Phase 1: Scanning file metadata...");
	const phase1Start = performance.now();

	let pathBuffer: string[] = [];

	const processPathBuffer = async (paths: string[]) => {
		const results = await Promise.allSettled(
			paths.map(async (pathStr) => {
				const stats = await fs.stat(pathStr);
				return { pathStr, stats };
			}),
		);

		for (const result of results) {
			if (result.status === "fulfilled") {
				const { pathStr, stats } = result.value;
				const metadataHash = calculateMetadataHash(stats);
				scannedPaths.add(pathStr);

				batchFilesDb.push({
					path: pathStr,
					libraryPathId,
					size: stats.size,
					mtime: new Date(stats.mtimeMs),
					status: "pending",
					hash: metadataHash,
				});

				scannedCount++;
			} else {
				console.log(`Error stat'ing file:`, result.reason);
			}
		}

		if (batchFilesDb.length >= DB_BATCH_SIZE) {
			await upsertScannedFiles(batchFilesDb);
			const elapsed = (performance.now() - phase1Start) / 1000;
			const rate = (scannedCount / elapsed).toFixed(0);
			console.log(
				`≫ Recorded: ${scannedCount.toLocaleString()} files (${rate} files/sec)`,
			);
			batchFilesDb = [];
		}
	};

	for await (const fullPath of entries) {
		pathBuffer.push(fullPath.toString());

		if (pathBuffer.length >= PARALLEL_STAT) {
			await processPathBuffer(pathBuffer);
			pathBuffer = [];
		}
	}

	// Process remaining paths in buffer
	if (pathBuffer.length > 0) {
		await processPathBuffer(pathBuffer);
	}

	// Flush remaining files to the database
	if (batchFilesDb.length > 0) {
		await upsertScannedFiles(batchFilesDb);
	}

	const phase1Time = ((performance.now() - phase1Start) / 1000).toFixed(2);
	const avgRate = (scannedCount / Number.parseFloat(phase1Time)).toFixed(0);
	console.log(
		`≫ Phase 1 complete: ${scannedCount.toLocaleString()} files in ${phase1Time}s (${avgRate} files/sec)`,
	);

	// Step 1.5: Detect and remove missing files
	console.log("\n≫ Phase 1.5: Detecting missing files...");
	await detectAndRemoveMissingFiles(
		normalizedRootDir,
		scannedPaths,
		libraryId,
		libraryPathId,
	);

	// Step 2: Find potential duplicates by the file metadata hash and verify their content
	console.log("\n≫ Phase 2: Finding potential duplicates...");
	const potentialDuplicates = await findPotentialDuplicates(libraryPathId);

	if (potentialDuplicates.length > 0) {
		console.log("≫ Verifying duplicates with content hash...");
		await verifyDuplicatesWithContent(potentialDuplicates);
	}

	// Step 3: Mark final duplicates in database for getting our final list of files
	console.log("\n≫ Phase 3: Marking final duplicates...");
	await markFinalDuplicates(libraryPathId);

	// Update remaining pending files to verified status (scoped to this library path)
	await db
		.update(scannedFile)
		.set({ status: "verified", updatedAt: new Date() })
		.where(
			and(
				eq(scannedFile.status, "pending"),
				eq(scannedFile.libraryPathId, libraryPathId),
			),
		);

	// Step 4: Generate job entries from the final list of files to populate the next tables (book, bookMetadata, etc...)
	// Uses keyset pagination (WHERE id > lastId) instead of OFFSET for consistent O(1) per page
	console.log("\n≫ Phase 4: Creating jobs...");
	const phase5Start = performance.now();
	let lastId = 0;

	while (true) {
		const files = await db
			.select()
			.from(scannedFile)
			.where(
				and(
					eq(scannedFile.status, "verified"),
					eq(scannedFile.libraryPathId, libraryPathId),
					gt(scannedFile.id, lastId),
				),
			)
			.orderBy(scannedFile.id)
			.limit(JOB_BATCH_SIZE);

		if (files.length === 0) break;
		lastId = files.at(-1)!.id;

		const jobBatch = files.map((file) => {
			const normalizedFilePath = path.normalize(file.path);
			const relPath = path
				.relative(normalizedRootDir, normalizedFilePath)
				.replace(/\\/g, "/");
			const filename = path.basename(file.path);

			return {
				name: "file-event",
				data: {
					action: "add",
					path: file.path,
					mtime: file.mtime.getTime(),
					size: file.size,
					filename,
					relativePath: relPath,
					lastModified: file.mtime.toISOString(),
					fileHash: file.hash,
					libraryId,
					libraryPathId,
					taskId,
				},
				opts: {
					// Files needing conversion (AZW3) get lower priority so EPUBs process first
					priority: needsConversion(filename) ? 10 : 1,
				},
			};
		});

		await fileEventQueue.addBulk(jobBatch);
		if (taskId) {
			await incrementTotalJobs(taskId, jobBatch.length);
		}
		jobsCreated += jobBatch.length;

		const elapsed = (performance.now() - phase5Start) / 1000;
		const rate = (jobsCreated / elapsed).toFixed(0);
		console.log(
			`≫ Jobs queued: ${jobsCreated.toLocaleString()} (${rate} jobs/sec)`,
		);
	}

	const phase5Time = ((performance.now() - phase5Start) / 1000).toFixed(2);
	console.log(
		`≫ Phase 4 complete: ${jobsCreated.toLocaleString()} jobs created in ${phase5Time}s`,
	);

	// Final overview
	console.timeEnd("scanLibrary");
	console.log("\n≫ Phase 5: Summary");
	const stats = await db
		.select({
			status: scannedFile.status,
			count: sql<number>`count(*)::int`,
		})
		.from(scannedFile)
		.where(eq(scannedFile.libraryPathId, libraryPathId))
		.groupBy(scannedFile.status);

	console.log("\nOverview:");
	console.log(`   • Total files scanned: ${scannedCount.toLocaleString()}`);
	for (const stat of stats) {
		console.log(`   • ${stat.status}: ${stat.count.toLocaleString()}`);
	}
	console.log(`   • Jobs created: ${jobsCreated.toLocaleString()}`);

	// await generateDuplicateReport();
}

async function upsertScannedFiles(
	files: {
		path: string;
		libraryPathId: number;
		size: number;
		mtime: Date;
		status: string;
		hash: string;
	}[],
) {
	await db
		.insert(scannedFile)
		.values(files)
		.onConflictDoUpdate({
			target: [scannedFile.path, scannedFile.libraryPathId],
			set: {
				// Only reset to 'pending' if the metadata hash changed (file was modified).
				// If the hash is the same, keep the existing status (e.g. 'done') to skip re-processing.
				status: sql`CASE WHEN ${scannedFile.hash} != excluded.hash THEN 'pending' ELSE ${scannedFile.status} END`,
				hash: sql`excluded.hash`,
				size: sql`excluded.size`,
				mtime: sql`excluded.mtime`,
				updatedAt: sql`now()`,
			},
		});
}

async function detectAndRemoveMissingFiles(
	rootDir: string,
	scannedPaths: Set<string>,
	libraryId: number,
	libraryPathId: number,
) {
	const detectStart = performance.now();

	// Only get files scoped to this library path
	const existingFiles = await db
		.select({ path: scannedFile.path })
		.from(scannedFile)
		.where(eq(scannedFile.libraryPathId, libraryPathId));

	const missingPaths: string[] = [];

	// Check which files in database are not in the current scan
	for (const dbFile of existingFiles) {
		if (!scannedPaths.has(dbFile.path)) {
			missingPaths.push(dbFile.path);
		}
	}

	if (missingPaths.length === 0) {
		console.log("≫ No missing files detected");
		return;
	}

	console.log(`≫ Found ${missingPaths.length} missing files`);

	// Create delete jobs for missing files
	const deleteJobs = missingPaths.map((filePath) => ({
		name: "file-event",
		data: {
			action: "delete",
			path: filePath,
			filename: path.basename(filePath),
			relativePath: path.relative(rootDir, filePath),
			libraryId,
			libraryPathId,
		},
	}));

	// Add delete jobs to queue in batches
	for (let i = 0; i < deleteJobs.length; i += JOB_BATCH_SIZE) {
		const batch = deleteJobs.slice(i, i + JOB_BATCH_SIZE);
		await fileEventQueue.addBulk(batch);
	}

	// Remove missing files from scannedFile table (scoped to library path)
	const BATCH_DELETE_SIZE = 1000;
	for (let i = 0; i < missingPaths.length; i += BATCH_DELETE_SIZE) {
		const batch = missingPaths.slice(i, i + BATCH_DELETE_SIZE);
		await db
			.delete(scannedFile)
			.where(
				and(
					inArray(scannedFile.path, batch),
					eq(scannedFile.libraryPathId, libraryPathId),
				),
			);
	}

	const detectTime = ((performance.now() - detectStart) / 1000).toFixed(2);
	console.log(
		`≫ Removed ${missingPaths.length} missing files in ${detectTime}s`,
	);
}

async function findPotentialDuplicates(libraryPathId: number) {
	const duplicateGroups = await db
		.select({
			hash: scannedFile.hash,
			count: sql<number>`count(*)::int`,
		})
		.from(scannedFile)
		.where(
			and(
				eq(scannedFile.status, "pending"),
				eq(scannedFile.libraryPathId, libraryPathId),
			),
		)
		.groupBy(scannedFile.hash)
		.having(sql`count(*) > 1`);

	if (duplicateGroups.length === 0) {
		console.log("≫ No potential duplicates found");
		return [];
	}

	console.log(
		`≫ Found ${duplicateGroups.length} groups with potential duplicates`,
	);

	// Fetch all duplicate files in a single query instead of N+1
	const duplicateHashes = duplicateGroups.map((g) => g.hash);
	const allDuplicates = await db
		.select()
		.from(scannedFile)
		.where(
			and(
				inArray(scannedFile.hash, duplicateHashes),
				eq(scannedFile.libraryPathId, libraryPathId),
			),
		);

	console.log(`≫ Total files to verify: ${allDuplicates.length}`);
	return allDuplicates;
}

async function verifyDuplicatesWithContent(files: DuplicateFile[]) {
	const verifyStart = performance.now();
	let verified = 0;

	for (let i = 0; i < files.length; i += PARALLEL_CONTENT_HASH) {
		const chunk = files.slice(i, i + PARALLEL_CONTENT_HASH);

		// Compute all content hashes in parallel (I/O bound), without awaiting DB writes
		const hashResults = await Promise.all(
			chunk.map(async (file) => {
				const contentHash = await calculateContentHash(file.path, file.size);
				return contentHash ? { file, contentHash } : null;
			}),
		);

		// Batch all DB updates in parallel (they target different rows, no contention)
		const updates = hashResults.filter(
			(r): r is NonNullable<typeof r> => r !== null,
		);
		if (updates.length > 0) {
			await Promise.all(
				updates.map((r) =>
					db
						.update(scannedFile)
						.set({
							hash: r.contentHash,
							updatedAt: new Date(),
						})
						.where(
							and(
								eq(scannedFile.path, r.file.path),
								eq(scannedFile.libraryPathId, r.file.libraryPathId),
							),
						),
				),
			);
		}

		verified += chunk.length;

		if (verified % 500 === 0 || verified === files.length) {
			const elapsed = (performance.now() - verifyStart) / 1000;
			const rate = (verified / elapsed).toFixed(0);
			console.log(
				`≫ Verified: ${verified}/${files.length} (${rate} files/sec)`,
			);
		}
	}

	const verifyTime = ((performance.now() - verifyStart) / 1000).toFixed(2);
	console.log(`≫ Content verification complete in ${verifyTime}s`);
}

async function markFinalDuplicates(libraryPathId: number) {
	const duplicateGroups = await db
		.select({
			hash: scannedFile.hash,
			count: sql<number>`count(*)::int`,
		})
		.from(scannedFile)
		.where(
			and(
				eq(scannedFile.status, "pending"),
				eq(scannedFile.libraryPathId, libraryPathId),
			),
		)
		.groupBy(scannedFile.hash)
		.having(sql`count(*) > 1`);

	if (duplicateGroups.length === 0) {
		console.log("≫ No duplicates to mark");
		return;
	}

	console.log(`≫ Found ${duplicateGroups.length} duplicate groups`);

	// Fetch all files from all duplicate groups in a single query
	const duplicateHashes = duplicateGroups.map((g) => g.hash);
	const allFiles = await db
		.select()
		.from(scannedFile)
		.where(
			and(
				inArray(scannedFile.hash, duplicateHashes),
				eq(scannedFile.libraryPathId, libraryPathId),
			),
		)
		.orderBy(scannedFile.hash, scannedFile.path);

	// Group files by hash in memory
	const groupedByHash = new Map<string, typeof allFiles>();
	for (const file of allFiles) {
		const group = groupedByHash.get(file.hash) ?? [];
		group.push(file);
		groupedByHash.set(file.hash, group);
	}

	// Collect all duplicate IDs to mark in a single batch update
	const allDuplicateIds: number[] = [];
	let duplicatesMarked = 0;

	for (const [, files] of groupedByHash) {
		const [primary, ...duplicates] = files;
		if (!primary || duplicates.length === 0) continue;

		for (const dup of duplicates) {
			allDuplicateIds.push(dup.id);
		}
		duplicatesMarked += duplicates.length;

		console.log(`\n  Primary: ${path.basename(primary.path)}`);
		console.log(`     Size: ${formatBytes(primary.size)}`);
		console.log(`  ${duplicates.length} duplicate(s):`);
		for (const dup of duplicates) {
			console.log(`     - ${path.basename(dup.path)}`);
		}
	}

	// Single batch update for all duplicates
	if (allDuplicateIds.length > 0) {
		for (let i = 0; i < allDuplicateIds.length; i += DB_BATCH_SIZE) {
			const batch = allDuplicateIds.slice(i, i + DB_BATCH_SIZE);
			await db
				.update(scannedFile)
				.set({
					status: "duplicate",
					updatedAt: new Date(),
				})
				.where(inArray(scannedFile.id, batch));
		}
	}

	console.log("\n≫ Summary:");
	console.log(`   • Duplicate groups: ${duplicateGroups.length}`);
	console.log(`   • Files marked as duplicates: ${duplicatesMarked}`);
}

export async function generateDuplicateReport(
	outputPath = "./duplicate-report.json",
) {
	console.log("\n≫ Generating duplicate report...");

	const duplicateGroups = await db
		.select({
			hash: scannedFile.hash,
			count: sql<number>`count(*)::int`,
		})
		.from(scannedFile)
		.groupBy(scannedFile.hash)
		.having(sql`count(*) > 1`);

	const report: DuplicateReportEntry[] = [];
	let totalWastedSpace = 0;

	for (const group of duplicateGroups) {
		const files = await db
			.select()
			.from(scannedFile)
			.where(eq(scannedFile.hash, group.hash));

		const wastedSpace = files[0].size * (files.length - 1);
		totalWastedSpace += wastedSpace;

		report.push({
			hash: group.hash,
			count: group.count,
			size: files[0].size,
			sizeFormatted: formatBytes(files[0].size),
			wastedSpace: wastedSpace,
			wastedSpaceFormatted: formatBytes(wastedSpace),
			files: files.map((f) => ({
				path: f.path,
				status: f.status,
				mtime: f.mtime.toISOString(),
			})),
		});
	}

	report.sort((a, b) => b.wastedSpace - a.wastedSpace);

	await Bun.write(outputPath, JSON.stringify(report, null, 2));

	console.log("≫ Duplicate Statistics:");
	console.log(`   • Duplicate groups: ${report.length}`);
	console.log(
		`   • Total duplicate files: ${report.reduce((sum, g) => sum + (g.count - 1), 0)}`,
	);
	console.log(`   • Total wasted space: ${formatBytes(totalWastedSpace)}`);
}
