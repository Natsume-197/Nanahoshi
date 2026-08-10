import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AlignmentArtifactDependencies } from "../alignment-artifact";
import {
	ExistingAlignmentImporter,
	readManagedAlignmentArtifact,
} from "../alignment-artifact";

const EBOOK_HASH = "a".repeat(64);
const AUDIO_HASH = "b".repeat(64);

function manifest(overrides: Record<string, unknown> = {}) {
	return {
		schema: "honomiya.read-listen.v1",
		createdAt: "2026-08-08T18:40:06.739Z",
		generator: { name: "honomiya", version: "0.1.0" },
		granularity: "sentence",
		sources: {
			ebook: { sha256: EBOOK_HASH, filename: "book.epub" },
			audioFiles: [
				{
					index: 0,
					sha256: AUDIO_HASH,
					filename: "book.m4b",
					durationMs: 10_000,
				},
			],
		},
		cues: [
			{
				id: "cue-1",
				text: {
					kind: "text-quote",
					sectionRef: "chapter.xhtml",
					exact: "Sentence.",
				},
				audioFileIndex: 0,
				startMs: 100,
				endMs: 900,
			},
		],
		...overrides,
	};
}

function createHarness(sidecar: unknown = manifest()) {
	const bytes = new TextEncoder().encode(JSON.stringify(sidecar));
	const dependencies: AlignmentArtifactDependencies = {
		readCandidate: mock(() => Promise.resolve(bytes)),
		hashFile: mock((filePath: string) =>
			Promise.resolve(filePath.endsWith(".epub") ? EBOOK_HASH : AUDIO_HASH),
		),
		storeArtifact: mock(() =>
			Promise.resolve("data/alignments/pair/artifact.json"),
		),
	};
	return {
		dependencies,
		importer: new ExistingAlignmentImporter(dependencies),
	};
}

describe("ExistingAlignmentImporter", () => {
	test("imports a structurally valid sidecar whose full source hashes match", async () => {
		const { importer, dependencies } = createHarness();

		const result = await importer.import("pair-uuid", {
			ebookPath: "/library/book.epub",
			audioPaths: ["/library/book.m4b"],
		});

		expect(result).toEqual(
			expect.objectContaining({
				outcome: "imported",
				artifact: expect.objectContaining({
					artifactPath: "data/alignments/pair/artifact.json",
					cueCount: 1,
					ebookSha256: EBOOK_HASH,
					audioSha256: [AUDIO_HASH],
				}),
			}),
		);
		expect(dependencies.readCandidate).toHaveBeenCalledWith(
			"/library/book.honomiya.alignment.json",
		);
		expect(dependencies.storeArtifact).toHaveBeenCalledTimes(1);
	});

	test("imports a worker output from its explicit managed staging path", async () => {
		const { importer, dependencies } = createHarness();

		const result = await importer.importGenerated(
			"pair-uuid",
			{
				ebookPath: "/library/book.epub",
				audioPaths: ["/library/book.m4b"],
			},
			"/data/work/alignment.json",
		);

		expect(result.outcome).toBe("imported");
		expect(dependencies.readCandidate).toHaveBeenCalledWith(
			"/data/work/alignment.json",
		);
	});

	test("returns not_found without hashing sources when the default sidecar is absent", async () => {
		const { importer, dependencies } = createHarness();
		dependencies.readCandidate = mock(() => Promise.resolve(null));

		const result = await importer.import("pair-uuid", {
			ebookPath: "/library/book.epub",
			audioPaths: ["/library/book.m4b"],
		});

		expect(result).toEqual({ outcome: "not_found" });
		expect(dependencies.hashFile).not.toHaveBeenCalled();
	});

	test("rejects malformed JSON as an invalid sidecar", async () => {
		const { importer, dependencies } = createHarness();
		dependencies.readCandidate = mock(() =>
			Promise.resolve(new TextEncoder().encode("{")),
		);

		const result = await importer.import("pair-uuid", {
			ebookPath: "/library/book.epub",
			audioPaths: ["/library/book.m4b"],
		});

		expect(result).toEqual({
			outcome: "invalid",
			reason: "invalid_manifest",
		});
	});

	test("rejects a valid sidecar produced from different ebook bytes", async () => {
		const { importer, dependencies } = createHarness();
		dependencies.hashFile = mock(() => Promise.resolve("c".repeat(64)));

		const result = await importer.import("pair-uuid", {
			ebookPath: "/library/book.epub",
			audioPaths: ["/library/book.m4b"],
		});

		expect(result).toEqual({
			outcome: "source_mismatch",
			reason: "ebook_changed",
		});
		expect(dependencies.storeArtifact).not.toHaveBeenCalled();
	});

	test("rejects a sidecar whose ordered audio set differs", async () => {
		const { importer, dependencies } = createHarness();

		const result = await importer.import("pair-uuid", {
			ebookPath: "/library/book.epub",
			audioPaths: ["/library/one.mp3", "/library/two.mp3"],
		});

		expect(result).toEqual({
			outcome: "source_mismatch",
			reason: "audio_set_changed",
		});
		expect(dependencies.hashFile).not.toHaveBeenCalled();
	});
});

describe("readManagedAlignmentArtifact", () => {
	test("returns a verified artifact without trusting a path outside managed storage", async () => {
		const previousCwd = process.cwd();
		const temporaryCwd = await fs.mkdtemp(
			path.join(os.tmpdir(), "read-listen-artifact-"),
		);
		try {
			process.chdir(temporaryCwd);
			const artifactPath = "data/alignments/pair/artifact.json";
			await fs.mkdir(path.dirname(artifactPath), { recursive: true });
			const bytes = new TextEncoder().encode(JSON.stringify(manifest()));
			await fs.writeFile(artifactPath, bytes);
			const sha256 = createHash("sha256").update(bytes).digest("hex");

			const result = await readManagedAlignmentArtifact(artifactPath, sha256);

			expect(result.cues).toHaveLength(1);
			expect(
				readManagedAlignmentArtifact("../artifact.json", sha256),
			).rejects.toThrow("escaped managed storage");
		} finally {
			process.chdir(previousCwd);
			await fs.rm(temporaryCwd, { recursive: true, force: true });
		}
	});

	test("reads a legacy Akasashi artifact through the Honomiya contract", async () => {
		const previousCwd = process.cwd();
		const temporaryCwd = await fs.mkdtemp(
			path.join(os.tmpdir(), "read-listen-legacy-artifact-"),
		);
		try {
			process.chdir(temporaryCwd);
			const artifactPath = "data/alignments/pair/artifact.json";
			await fs.mkdir(path.dirname(artifactPath), { recursive: true });
			const bytes = new TextEncoder().encode(
				JSON.stringify(
					manifest({
						schema: "akasashi.read-listen.v1",
						generator: { name: "akasashi", version: "0.1.0" },
					}),
				),
			);
			await fs.writeFile(artifactPath, bytes);
			const sha256 = createHash("sha256").update(bytes).digest("hex");

			const result = await readManagedAlignmentArtifact(artifactPath, sha256);

			expect(result.schema).toBe("honomiya.read-listen.v1");
			expect(result.generator.name).toBe("honomiya");
		} finally {
			process.chdir(previousCwd);
			await fs.rm(temporaryCwd, { recursive: true, force: true });
		}
	});
});
