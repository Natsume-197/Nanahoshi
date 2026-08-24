import { createHash, randomUUID } from "node:crypto";
import { createReadStream, type Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import {
	type HONOMIYA_MANIFEST_SCHEMA,
	type HonomiyaManifestV1,
	honomiyaManifestV1Schema,
} from "@nanahoshi-v2/read-listen/manifest";
import { z } from "zod";

const MAX_SIDECAR_BYTES = 64 * 1024 * 1024;

export type ReadListenAlignmentOrigin = "external" | "honomiya";

const alignmentOriginReportSchema = z.object({
	transcription: z.object({
		mode: z.enum(["provider", "precomputed", "timed-text"]),
	}),
});

const alignmentReportSchema = z.object({
	alignment: z.object({
		bookSentences: z.number().int().nonnegative(),
		directCues: z.number().int().nonnegative(),
		interpolatedCues: z.number().int().nonnegative(),
		unmatchedSentences: z.number().int().nonnegative(),
		bookCoverage: z.number().min(0).max(1),
		directCoverage: z.number().min(0).max(1),
	}),
	transcription: z.object({
		timedText: z
			.array(
				z.object({
					filename: z.string(),
					usedCues: z.number().int().nonnegative(),
					excludedCues: z.number().int().nonnegative(),
					verification: z
						.object({
							status: z.enum(["passed", "failed"]),
							confidence: z.enum(["high", "medium", "low"]),
							averageScore: z.number().min(0).max(1),
							passingSamples: z.number().int().nonnegative(),
							totalSamples: z.number().int().positive(),
						})
						.optional(),
				}),
			)
			.optional(),
	}),
});

export type AlignmentReportSummary = z.infer<typeof alignmentReportSchema>;

function managedAlignmentRoot(): string {
	return path.resolve(process.cwd(), "data", "alignments");
}

function resolveManagedArtifactPath(artifactPath: string): string {
	if (path.isAbsolute(artifactPath)) {
		throw new Error("Alignment artifact path must be relative");
	}
	const root = managedAlignmentRoot();
	const resolved = path.resolve(process.cwd(), artifactPath);
	if (!resolved.startsWith(`${root}${path.sep}`)) {
		throw new Error("Alignment artifact path escaped managed storage");
	}
	return resolved;
}

/** Reads an immutable managed artifact and verifies its recorded identity. */
export async function readManagedAlignmentArtifact(
	artifactPath: string,
	expectedSha256: string,
): Promise<HonomiyaManifestV1> {
	const resolved = resolveManagedArtifactPath(artifactPath);
	const stat = await fs.stat(resolved);
	if (!stat.isFile() || stat.size > MAX_SIDECAR_BYTES) {
		throw new Error("Alignment artifact is not a readable regular file");
	}
	const bytes = await fs.readFile(resolved);
	const actualSha256 = createHash("sha256").update(bytes).digest("hex");
	if (actualSha256 !== expectedSha256) {
		throw new Error("Alignment artifact identity does not match storage");
	}
	return honomiyaManifestV1Schema.parse(
		JSON.parse(new TextDecoder().decode(bytes)),
	);
}

/** Reads the private diagnostics paired with an immutable managed artifact. */
export async function readManagedAlignmentReport(
	artifactPath: string,
): Promise<AlignmentReportSummary | null> {
	const artifact = resolveManagedArtifactPath(artifactPath);
	const reportPath = artifact.replace(/\.json$/u, ".report.json");
	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(reportPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	if (!stat.isFile() || stat.size > MAX_SIDECAR_BYTES) {
		throw new Error("Alignment report is not a readable regular file");
	}
	return alignmentReportSchema.parse(
		JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(
				await fs.readFile(reportPath),
			),
		),
	);
}

export type AlignmentImportMetadata = {
	artifactPath: string;
	artifactSha256: string;
	sidecarSchema: typeof HONOMIYA_MANIFEST_SCHEMA;
	generatorName: "honomiya";
	generatorVersion: string;
	origin: ReadListenAlignmentOrigin | null;
	generatedAt: string;
	ebookSha256: string;
	audioSha256: string[];
	cueCount: number;
};

export type ExistingAlignmentImportResult =
	| { outcome: "not_found" }
	| { outcome: "invalid"; reason: "invalid_manifest" | "unreadable" }
	| {
			outcome: "source_mismatch";
			reason: "ebook_changed" | "audio_changed" | "audio_set_changed";
	  }
	| { outcome: "imported"; artifact: AlignmentImportMetadata };

export type ExistingAlignmentSources = {
	ebookPath: string;
	audioPaths: string[];
};

export interface AlignmentArtifactDependencies {
	readCandidate(candidatePath: string): Promise<Uint8Array | null>;
	listManagedCandidates?(): Promise<string[]>;
	hashFile(filePath: string): Promise<string>;
	storeArtifact(
		pairUuid: string,
		artifactSha256: string,
		bytes: Uint8Array,
	): Promise<string>;
	storeReport?(
		pairUuid: string,
		artifactSha256: string,
		bytes: Uint8Array,
	): Promise<void>;
}

function defaultSidecarPath(ebookPath: string): string {
	const parsed = path.parse(ebookPath);
	return path.join(parsed.dir, `${parsed.name}.honomiya.alignment.json`);
}

async function hashFileSha256(filePath: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(filePath)) hash.update(chunk);
	return hash.digest("hex");
}

async function readCandidate(
	candidatePath: string,
): Promise<Uint8Array | null> {
	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(candidatePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	if (!stat.isFile() || stat.size > MAX_SIDECAR_BYTES) {
		throw new Error("Alignment sidecar is not a readable regular file");
	}
	return fs.readFile(candidatePath);
}

async function listManagedCandidates(): Promise<string[]> {
	const root = managedAlignmentRoot();
	let directories: Dirent[];
	try {
		directories = await fs.readdir(root, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}

	const candidates: string[] = [];
	for (const directory of directories) {
		if (!directory.isDirectory()) continue;
		const directoryPath = path.join(root, directory.name);
		let entries: Dirent[];
		try {
			entries = await fs.readdir(directoryPath, { withFileTypes: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		for (const entry of entries) {
			if (entry.isFile() && /^[a-f0-9]{64}\.json$/u.test(entry.name)) {
				candidates.push(path.join(directoryPath, entry.name));
			}
		}
	}
	return candidates.sort();
}

async function storeArtifact(
	pairUuid: string,
	artifactSha256: string,
	bytes: Uint8Array,
): Promise<string> {
	const directory = path.join(managedAlignmentRoot(), pairUuid);
	const target = path.join(directory, `${artifactSha256}.json`);
	await fs.mkdir(directory, { recursive: true });
	try {
		await fs.access(target);
		return path.relative(process.cwd(), target);
	} catch {
		// The immutable artifact is not stored yet.
	}

	const staging = path.join(
		directory,
		`.${artifactSha256}.${randomUUID()}.tmp`,
	);
	try {
		await fs.writeFile(staging, bytes, { flag: "wx" });
		await fs.rename(staging, target).catch(async (error) => {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		});
	} finally {
		await fs.unlink(staging).catch(() => {});
	}
	return path.relative(process.cwd(), target);
}

async function storeReport(
	pairUuid: string,
	artifactSha256: string,
	bytes: Uint8Array,
): Promise<void> {
	JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const directory = path.join(managedAlignmentRoot(), pairUuid);
	const target = path.join(directory, `${artifactSha256}.report.json`);
	await fs.mkdir(directory, { recursive: true });
	const staging = path.join(
		directory,
		`.${artifactSha256}.${randomUUID()}.report.tmp`,
	);
	try {
		await fs.writeFile(staging, bytes, { flag: "wx" });
		await fs.rename(staging, target);
	} finally {
		await fs.unlink(staging).catch(() => {});
	}
}

const runtimeDependencies: AlignmentArtifactDependencies = {
	readCandidate,
	listManagedCandidates,
	hashFile: hashFileSha256,
	storeArtifact,
	storeReport,
};

/**
 * Finds Honomiya's deterministic sidecar, validates its complete structure and
 * source identities, then places an immutable copy in Nanahoshi storage.
 */
export class ExistingAlignmentImporter {
	constructor(
		private readonly dependencies: AlignmentArtifactDependencies = runtimeDependencies,
	) {}

	async import(
		pairUuid: string,
		sources: ExistingAlignmentSources,
	): Promise<ExistingAlignmentImportResult> {
		const candidatePath = defaultSidecarPath(sources.ebookPath);
		const nearbyResult = await this.importCandidate(
			pairUuid,
			sources,
			candidatePath,
			`${candidatePath}.report.json`,
		);
		if (nearbyResult.outcome === "imported") return nearbyResult;

		const managedResult = await this.importManagedCandidate(pairUuid, sources);
		return managedResult.outcome === "imported"
			? managedResult
			: nearbyResult.outcome === "not_found"
				? managedResult
				: nearbyResult;
	}

	/** Import an explicit worker output without writing into the source library. */
	async importGenerated(
		pairUuid: string,
		sources: ExistingAlignmentSources,
		candidatePath: string,
		reportCandidatePath?: string,
	): Promise<ExistingAlignmentImportResult> {
		return this.importCandidate(
			pairUuid,
			sources,
			candidatePath,
			reportCandidatePath,
			reportCandidatePath !== undefined,
		);
	}

	/** Import a browser-provided artifact without first writing it to the library. */
	async importUploaded(
		pairUuid: string,
		sources: ExistingAlignmentSources,
		bytes: Uint8Array,
		reportBytes?: Uint8Array,
	): Promise<ExistingAlignmentImportResult> {
		return this.importBytes(pairUuid, sources, bytes, reportBytes);
	}

	private async importCandidate(
		pairUuid: string,
		sources: ExistingAlignmentSources,
		candidatePath: string,
		reportCandidatePath?: string,
		requireReport = false,
	): Promise<ExistingAlignmentImportResult> {
		let bytes: Uint8Array | null;
		try {
			bytes = await this.dependencies.readCandidate(candidatePath);
		} catch {
			return { outcome: "invalid", reason: "unreadable" };
		}
		if (!bytes) return { outcome: "not_found" };
		let reportBytes: Uint8Array | undefined;
		if (reportCandidatePath) {
			try {
				reportBytes =
					(await this.dependencies.readCandidate(reportCandidatePath)) ??
					undefined;
				if (!reportBytes && requireReport) {
					return { outcome: "invalid", reason: "unreadable" };
				}
			} catch {
				return { outcome: "invalid", reason: "unreadable" };
			}
		}
		return this.importBytes(pairUuid, sources, bytes, reportBytes);
	}

	private async importManagedCandidate(
		pairUuid: string,
		sources: ExistingAlignmentSources,
	): Promise<ExistingAlignmentImportResult> {
		if (!this.dependencies.listManagedCandidates) {
			return { outcome: "not_found" };
		}

		let candidatePaths: string[];
		try {
			candidatePaths = await this.dependencies.listManagedCandidates();
		} catch {
			return { outcome: "invalid", reason: "unreadable" };
		}
		if (candidatePaths.length === 0) return { outcome: "not_found" };

		const sourceHashes = await this.hashSources(sources);
		const matches: Array<{
			path: string;
			bytes: Uint8Array;
			manifest: HonomiyaManifestV1;
		}> = [];
		for (const candidatePath of candidatePaths) {
			let bytes: Uint8Array | null;
			try {
				bytes = await this.dependencies.readCandidate(candidatePath);
			} catch {
				continue;
			}
			if (!bytes) continue;
			let json: unknown;
			try {
				json = JSON.parse(new TextDecoder().decode(bytes));
			} catch {
				continue;
			}
			const parsed = honomiyaManifestV1Schema.safeParse(json);
			if (
				parsed.success &&
				this.manifestMatchesSourceHashes(parsed.data, sourceHashes)
			) {
				matches.push({ path: candidatePath, bytes, manifest: parsed.data });
			}
		}
		matches.sort((left, right) =>
			right.manifest.createdAt.localeCompare(left.manifest.createdAt),
		);
		const newest = matches[0];
		if (!newest) return { outcome: "not_found" };

		let reportBytes: Uint8Array | undefined;
		try {
			reportBytes =
				(await this.dependencies.readCandidate(
					newest.path.replace(/\.json$/u, ".report.json"),
				)) ?? undefined;
		} catch {
			// The manifest remains recoverable when its optional report is unreadable.
		}
		const result = await this.importBytes(
			pairUuid,
			sources,
			newest.bytes,
			reportBytes,
			sourceHashes,
		);
		if (result.outcome === "invalid" && reportBytes) {
			return this.importBytes(
				pairUuid,
				sources,
				newest.bytes,
				undefined,
				sourceHashes,
			);
		}
		return result;
	}

	private async hashSources(
		sources: ExistingAlignmentSources,
	): Promise<{ ebookSha256: string; audioSha256: string[] }> {
		const [ebookSha256, audioSha256] = await Promise.all([
			this.dependencies.hashFile(sources.ebookPath),
			Promise.all(
				sources.audioPaths.map((audioPath) =>
					this.dependencies.hashFile(audioPath),
				),
			),
		]);
		return { ebookSha256, audioSha256 };
	}

	private manifestMatchesSourceHashes(
		manifest: HonomiyaManifestV1,
		sourceHashes: { ebookSha256: string; audioSha256: string[] },
	): boolean {
		if (
			manifest.sources.ebook.sha256 !== sourceHashes.ebookSha256 ||
			manifest.sources.audioFiles.length !== sourceHashes.audioSha256.length
		) {
			return false;
		}
		return sourceHashes.audioSha256.every(
			(sha256, index) =>
				manifest.sources.audioFiles.find((audio) => audio.index === index)
					?.sha256 === sha256,
		);
	}

	private async importBytes(
		pairUuid: string,
		sources: ExistingAlignmentSources,
		bytes: Uint8Array,
		reportBytes?: Uint8Array,
		knownSourceHashes?: { ebookSha256: string; audioSha256: string[] },
	): Promise<ExistingAlignmentImportResult> {
		let json: unknown;
		try {
			json = JSON.parse(new TextDecoder().decode(bytes));
		} catch {
			return { outcome: "invalid", reason: "invalid_manifest" };
		}
		const parsed = honomiyaManifestV1Schema.safeParse(json);
		if (!parsed.success) {
			return { outcome: "invalid", reason: "invalid_manifest" };
		}
		const manifest = parsed.data;
		if (manifest.sources.audioFiles.length !== sources.audioPaths.length) {
			return { outcome: "source_mismatch", reason: "audio_set_changed" };
		}

		const ebookSha256 =
			knownSourceHashes?.ebookSha256 ??
			(await this.dependencies.hashFile(sources.ebookPath));
		if (ebookSha256 !== manifest.sources.ebook.sha256) {
			return { outcome: "source_mismatch", reason: "ebook_changed" };
		}

		const audioSha256: string[] = [];
		for (const [index, audioPath] of sources.audioPaths.entries()) {
			const declared = manifest.sources.audioFiles.find(
				(audio) => audio.index === index,
			);
			if (!declared) {
				return { outcome: "source_mismatch", reason: "audio_set_changed" };
			}
			const actual =
				knownSourceHashes?.audioSha256[index] ??
				(await this.dependencies.hashFile(audioPath));
			if (actual !== declared.sha256) {
				return { outcome: "source_mismatch", reason: "audio_changed" };
			}
			audioSha256.push(actual);
		}

		const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
		let origin: ReadListenAlignmentOrigin | null =
			manifest.transcription?.origin ?? null;
		if (reportBytes) {
			try {
				const report = JSON.parse(
					new TextDecoder("utf-8", { fatal: true }).decode(reportBytes),
				);
				const provenance = alignmentOriginReportSchema.safeParse(report);
				if (provenance.success && origin === null) {
					origin =
						provenance.data.transcription.mode === "timed-text"
							? "external"
							: "honomiya";
				}
			} catch {
				return { outcome: "invalid", reason: "invalid_manifest" };
			}
		}
		const artifactPath = await this.dependencies.storeArtifact(
			pairUuid,
			artifactSha256,
			bytes,
		);
		if (reportBytes) {
			if (!this.dependencies.storeReport) {
				throw new Error("Alignment report storage is unavailable");
			}
			await this.dependencies.storeReport(
				pairUuid,
				artifactSha256,
				reportBytes,
			);
		}
		return {
			outcome: "imported",
			artifact: {
				artifactPath,
				artifactSha256,
				sidecarSchema: manifest.schema,
				generatorName: manifest.generator.name,
				generatorVersion: manifest.generator.version,
				origin,
				generatedAt: manifest.createdAt,
				ebookSha256,
				audioSha256,
				cueCount: manifest.cues.length,
			},
		};
	}
}

export const existingAlignmentImporter = new ExistingAlignmentImporter();
