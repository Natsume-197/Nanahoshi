import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import {
	type HONOMIYA_MANIFEST_SCHEMA,
	type HonomiyaManifestV1,
	honomiyaManifestV1Schema,
} from "@nanahoshi-v2/read-listen/manifest";

const MAX_SIDECAR_BYTES = 64 * 1024 * 1024;

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

export type AlignmentImportMetadata = {
	artifactPath: string;
	artifactSha256: string;
	sidecarSchema: typeof HONOMIYA_MANIFEST_SCHEMA;
	generatorName: "honomiya";
	generatorVersion: string;
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
	hashFile(filePath: string): Promise<string>;
	storeArtifact(
		pairUuid: string,
		artifactSha256: string,
		bytes: Uint8Array,
	): Promise<string>;
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

const runtimeDependencies: AlignmentArtifactDependencies = {
	readCandidate,
	hashFile: hashFileSha256,
	storeArtifact,
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
		return this.importCandidate(
			pairUuid,
			sources,
			defaultSidecarPath(sources.ebookPath),
		);
	}

	/** Import an explicit worker output without writing into the source library. */
	async importGenerated(
		pairUuid: string,
		sources: ExistingAlignmentSources,
		candidatePath: string,
	): Promise<ExistingAlignmentImportResult> {
		return this.importCandidate(pairUuid, sources, candidatePath);
	}

	private async importCandidate(
		pairUuid: string,
		sources: ExistingAlignmentSources,
		candidatePath: string,
	): Promise<ExistingAlignmentImportResult> {
		let bytes: Uint8Array | null;
		try {
			bytes = await this.dependencies.readCandidate(candidatePath);
		} catch {
			return { outcome: "invalid", reason: "unreadable" };
		}
		if (!bytes) return { outcome: "not_found" };

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

		const ebookSha256 = await this.dependencies.hashFile(sources.ebookPath);
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
			const actual = await this.dependencies.hashFile(audioPath);
			if (actual !== declared.sha256) {
				return { outcome: "source_mismatch", reason: "audio_changed" };
			}
			audioSha256.push(actual);
		}

		const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
		const artifactPath = await this.dependencies.storeArtifact(
			pairUuid,
			artifactSha256,
			bytes,
		);
		return {
			outcome: "imported",
			artifact: {
				artifactPath,
				artifactSha256,
				sidecarSchema: manifest.schema,
				generatorName: manifest.generator.name,
				generatorVersion: manifest.generator.version,
				generatedAt: manifest.createdAt,
				ebookSha256,
				audioSha256,
				cueCount: manifest.cues.length,
			},
		};
	}
}

export const existingAlignmentImporter = new ExistingAlignmentImporter();
