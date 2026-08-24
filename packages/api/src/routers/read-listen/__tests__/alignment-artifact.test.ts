import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AlignmentArtifactDependencies } from "../alignment-artifact";
import {
	ExistingAlignmentImporter,
	readManagedAlignmentArtifact,
	readManagedAlignmentReport,
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
		readCandidate: mock((candidatePath: string) =>
			Promise.resolve(candidatePath.endsWith(".report.json") ? null : bytes),
		),
		hashFile: mock((filePath: string) =>
			Promise.resolve(filePath.endsWith(".epub") ? EBOOK_HASH : AUDIO_HASH),
		),
		storeArtifact: mock(() =>
			Promise.resolve("data/alignments/pair/artifact.json"),
		),
		storeReport: mock(() => Promise.resolve()),
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

	test("imports browser-provided bytes without reading a library sidecar", async () => {
		const { importer, dependencies } = createHarness();
		const uploaded = new TextEncoder().encode(JSON.stringify(manifest()));

		const result = await importer.importUploaded(
			"pair-uuid",
			{
				ebookPath: "/library/book.epub",
				audioPaths: ["/library/book.m4b"],
			},
			uploaded,
			new TextEncoder().encode("{}"),
		);

		expect(result.outcome).toBe("imported");
		expect(dependencies.readCandidate).not.toHaveBeenCalled();
		expect(dependencies.storeArtifact).toHaveBeenCalledWith(
			"pair-uuid",
			expect.stringMatching(/^[a-f0-9]{64}$/),
			uploaded,
		);
		expect(dependencies.storeReport).toHaveBeenCalledTimes(1);
	});

	test.each([
		["timed-text", "external"],
		["provider", "honomiya"],
		["precomputed", "honomiya"],
	] as const)(
		"records %s report provenance as %s",
		async (mode, expectedOrigin) => {
			const { importer } = createHarness();
			const result = await importer.importUploaded(
				"pair-uuid",
				{
					ebookPath: "/library/book.epub",
					audioPaths: ["/library/book.m4b"],
				},
				new TextEncoder().encode(JSON.stringify(manifest())),
				new TextEncoder().encode(JSON.stringify({ transcription: { mode } })),
			);

			expect(result).toEqual(
				expect.objectContaining({
					outcome: "imported",
					artifact: expect.objectContaining({ origin: expectedOrigin }),
				}),
			);
		},
	);

	test.each([
		["external", "provider"],
		["honomiya", "timed-text"],
	] as const)(
		"prioritizes embedded %s provenance over the %s report mode",
		async (embeddedOrigin, reportMode) => {
			const { importer } = createHarness();
			const result = await importer.importUploaded(
				"pair-uuid",
				{
					ebookPath: "/library/book.epub",
					audioPaths: ["/library/book.m4b"],
				},
				new TextEncoder().encode(
					JSON.stringify(
						manifest({ transcription: { origin: embeddedOrigin } }),
					),
				),
				new TextEncoder().encode(
					JSON.stringify({ transcription: { mode: reportMode } }),
				),
			);

			expect(result).toEqual(
				expect.objectContaining({
					artifact: expect.objectContaining({ origin: embeddedOrigin }),
				}),
			);
		},
	);

	test("records embedded provenance without requiring a report", async () => {
		const { importer } = createHarness(
			manifest({ transcription: { origin: "external" } }),
		);

		const result = await importer.importUploaded(
			"pair-uuid",
			{
				ebookPath: "/library/book.epub",
				audioPaths: ["/library/book.m4b"],
			},
			new TextEncoder().encode(
				JSON.stringify(manifest({ transcription: { origin: "external" } })),
			),
		);

		expect(result).toEqual(
			expect.objectContaining({
				artifact: expect.objectContaining({ origin: "external" }),
			}),
		);
	});

	test("leaves provenance unknown when no report provides evidence", async () => {
		const { importer } = createHarness();
		const result = await importer.importUploaded(
			"pair-uuid",
			{
				ebookPath: "/library/book.epub",
				audioPaths: ["/library/book.m4b"],
			},
			new TextEncoder().encode(JSON.stringify(manifest())),
		);

		expect(result).toEqual(
			expect.objectContaining({
				outcome: "imported",
				artifact: expect.objectContaining({ origin: null }),
			}),
		);
	});

	test("persists the generated alignment report beside the immutable artifact", async () => {
		const { importer, dependencies } = createHarness();
		const reportBytes = new TextEncoder().encode(
			JSON.stringify({ transcription: { mode: "provider" } }),
		);
		dependencies.readCandidate = mock((candidatePath: string) =>
			Promise.resolve(
				candidatePath.endsWith(".report.json")
					? reportBytes
					: new TextEncoder().encode(JSON.stringify(manifest())),
			),
		);

		const result = await importer.importGenerated(
			"pair-uuid",
			{
				ebookPath: "/library/book.epub",
				audioPaths: ["/library/book.m4b"],
			},
			"/data/work/alignment.json",
			"/data/work/alignment.json.report.json",
		);

		expect(result.outcome).toBe("imported");
		expect(dependencies.readCandidate).toHaveBeenCalledWith(
			"/data/work/alignment.json.report.json",
		);
		expect(dependencies.storeReport).toHaveBeenCalledWith(
			"pair-uuid",
			expect.stringMatching(/^[a-f0-9]{64}$/),
			expect.any(Uint8Array),
		);
		expect(result).toEqual(
			expect.objectContaining({
				artifact: expect.objectContaining({ origin: "honomiya" }),
			}),
		);
	});

	test("discovers an optional neighboring report and records its provenance", async () => {
		const { importer, dependencies } = createHarness();
		const sidecarBytes = new TextEncoder().encode(JSON.stringify(manifest()));
		dependencies.readCandidate = mock((candidatePath: string) =>
			Promise.resolve(
				candidatePath.endsWith(".report.json")
					? new TextEncoder().encode(
							JSON.stringify({ transcription: { mode: "timed-text" } }),
						)
					: sidecarBytes,
			),
		);

		const result = await importer.import("pair-uuid", {
			ebookPath: "/library/book.epub",
			audioPaths: ["/library/book.m4b"],
		});

		expect(dependencies.readCandidate).toHaveBeenCalledWith(
			"/library/book.honomiya.alignment.json.report.json",
		);
		expect(result).toEqual(
			expect.objectContaining({
				artifact: expect.objectContaining({ origin: "external" }),
			}),
		);
	});

	test("recovers the newest managed artifact after the sources are paired again", async () => {
		const { importer, dependencies } = createHarness();
		const olderPath = "/managed/old-pair/older.json";
		const newestPath = "/managed/old-pair/newest.json";
		const olderBytes = new TextEncoder().encode(
			JSON.stringify(
				manifest({
					createdAt: "2026-08-01T00:00:00.000Z",
					generator: { name: "honomiya", version: "0.1.0" },
				}),
			),
		);
		const newestBytes = new TextEncoder().encode(
			JSON.stringify(
				manifest({
					createdAt: "2026-08-02T00:00:00.000Z",
					generator: { name: "honomiya", version: "0.2.0" },
					transcription: { origin: "external" },
				}),
			),
		);
		const reportBytes = new TextEncoder().encode(
			JSON.stringify({ transcription: { mode: "timed-text" } }),
		);
		dependencies.listManagedCandidates = mock(() =>
			Promise.resolve([olderPath, newestPath]),
		);
		dependencies.readCandidate = mock((candidatePath: string) => {
			if (candidatePath === olderPath) return Promise.resolve(olderBytes);
			if (candidatePath === newestPath) return Promise.resolve(newestBytes);
			if (candidatePath === "/managed/old-pair/newest.report.json") {
				return Promise.resolve(reportBytes);
			}
			return Promise.resolve(null);
		});

		const result = await importer.import("new-pair", {
			ebookPath: "/library/book.epub",
			audioPaths: ["/library/book.m4b"],
		});

		expect(result).toEqual(
			expect.objectContaining({
				outcome: "imported",
				artifact: expect.objectContaining({
					generatorVersion: "0.2.0",
					origin: "external",
				}),
			}),
		);
		expect(dependencies.storeArtifact).toHaveBeenCalledWith(
			"new-pair",
			expect.stringMatching(/^[a-f0-9]{64}$/u),
			newestBytes,
		);
		expect(dependencies.storeReport).toHaveBeenCalledWith(
			"new-pair",
			expect.stringMatching(/^[a-f0-9]{64}$/u),
			reportBytes,
		);
		expect(dependencies.hashFile).toHaveBeenCalledTimes(2);
	});

	test("rediscovers an orphaned managed artifact through the real filesystem", async () => {
		const previousCwd = process.cwd();
		const temporaryCwd = await fs.mkdtemp(
			path.join(os.tmpdir(), "read-listen-repair-"),
		);
		try {
			process.chdir(temporaryCwd);
			const libraryDirectory = path.join(temporaryCwd, "library");
			const ebookPath = path.join(libraryDirectory, "book.epub");
			const audioPath = path.join(libraryDirectory, "book.m4b");
			const ebookBytes = new TextEncoder().encode("ebook bytes");
			const audioBytes = new TextEncoder().encode("audio bytes");
			await fs.mkdir(libraryDirectory, { recursive: true });
			await fs.writeFile(ebookPath, ebookBytes);
			await fs.writeFile(audioPath, audioBytes);

			const artifactBytes = new TextEncoder().encode(
				JSON.stringify(
					manifest({
						transcription: { origin: "external" },
						sources: {
							ebook: {
								sha256: createHash("sha256").update(ebookBytes).digest("hex"),
								filename: "book.epub",
							},
							audioFiles: [
								{
									index: 0,
									sha256: createHash("sha256").update(audioBytes).digest("hex"),
									filename: "book.m4b",
									durationMs: 10_000,
								},
							],
						},
					}),
				),
			);
			const artifactSha256 = createHash("sha256")
				.update(artifactBytes)
				.digest("hex");
			const orphanedPath = path.join(
				"data",
				"alignments",
				"old-pair",
				`${artifactSha256}.json`,
			);
			await fs.mkdir(path.dirname(orphanedPath), { recursive: true });
			await fs.writeFile(orphanedPath, artifactBytes);
			await fs.writeFile(
				orphanedPath.replace(/\.json$/u, ".report.json"),
				JSON.stringify({ transcription: { mode: "timed-text" } }),
			);

			const result = await new ExistingAlignmentImporter().import("new-pair", {
				ebookPath,
				audioPaths: [audioPath],
			});

			expect(result).toEqual(
				expect.objectContaining({
					outcome: "imported",
					artifact: expect.objectContaining({ origin: "external" }),
				}),
			);
			expect(
				await fs.readFile(
					path.join("data", "alignments", "new-pair", `${artifactSha256}.json`),
				),
			).toEqual(artifactBytes);
			expect(
				await fs.stat(
					path.join(
						"data",
						"alignments",
						"new-pair",
						`${artifactSha256}.report.json`,
					),
				),
			).toBeTruthy();
		} finally {
			process.chdir(previousCwd);
			await fs.rm(temporaryCwd, { recursive: true, force: true });
		}
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

describe("readManagedAlignmentReport", () => {
	test("returns only validated diagnostics from the paired report", async () => {
		const previousCwd = process.cwd();
		const temporaryCwd = await fs.mkdtemp(
			path.join(os.tmpdir(), "read-listen-report-"),
		);
		try {
			process.chdir(temporaryCwd);
			const artifactPath = "data/alignments/pair/artifact.json";
			await fs.mkdir(path.dirname(artifactPath), { recursive: true });
			await fs.writeFile(
				artifactPath.replace(/\.json$/u, ".report.json"),
				JSON.stringify({
					alignment: {
						bookSentences: 10,
						directCues: 9,
						interpolatedCues: 0,
						unmatchedSentences: 1,
						bookCoverage: 0.9,
						directCoverage: 0.9,
					},
					transcription: {
						timedText: [
							{ filename: "book.srt", usedCues: 12, excludedCues: 1 },
						],
					},
					extraPrivateDetails: "not returned",
				}),
			);

			const report = await readManagedAlignmentReport(artifactPath);

			expect(report?.alignment.directCoverage).toBe(0.9);
			expect(report?.transcription.timedText?.[0]?.excludedCues).toBe(1);
			expect(report).not.toHaveProperty("extraPrivateDetails");
		} finally {
			process.chdir(previousCwd);
			await fs.rm(temporaryCwd, { recursive: true, force: true });
		}
	});
});
