// Idempotent operational importer for an audited Read & Listen SRT manifest.
// It must run in the server environment so uploaded inputs and queue jobs share
// the same managed data directory and Redis connection as Nanahoshi.
//
//   bun run packages/api/scripts/read-listen-subtitle-import.ts \
//     --manifest=/absolute/path/pilot.json

import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "@nanahoshi-v2/db";
import { readListenService } from "../src/routers/read-listen/read-listen.service";

type ImportEntry = {
	audiobookUuid: string;
	ebookUuid: string;
	srtPath: string;
	expectedAudiobookTitle?: string;
	expectedEbookTitle?: string;
};

type ImportManifest = {
	serverId: string;
	requestedByUserId: string;
	entries: ImportEntry[];
};

type CanonicalRow = {
	id: string;
	uuid: string;
	media_type: "audiobook" | "ebook";
	duplicate_of_book_id: string | null;
	audio_track_count: string;
};

function manifestArg(): string {
	const value = process.argv
		.find((argument) => argument.startsWith("--manifest="))
		?.slice("--manifest=".length);
	if (!value) throw new Error("Use --manifest=/absolute/path/pilot.json");
	return path.resolve(value);
}

function validateManifest(value: unknown): asserts value is ImportManifest {
	if (!value || typeof value !== "object") throw new Error("Invalid manifest");
	const manifest = value as Partial<ImportManifest>;
	if (!manifest.serverId || !manifest.requestedByUserId) {
		throw new Error("Manifest requires serverId and requestedByUserId");
	}
	if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
		throw new Error("Manifest requires at least one entry");
	}
	for (const entry of manifest.entries) {
		if (!entry.audiobookUuid || !entry.ebookUuid || !entry.srtPath) {
			throw new Error(
				"Every entry requires audiobookUuid, ebookUuid and srtPath",
			);
		}
	}
}

async function canonicalSources(
	serverId: string,
	entry: ImportEntry,
): Promise<{ audiobookId: number; ebookId: number }> {
	const result = await pool.query<CanonicalRow>(
		`SELECT b.id::text, b.uuid::text, l.media_type,
		        b.duplicate_of_book_id::text,
		        (SELECT count(*)::text FROM audio_file af WHERE af.book_id = b.id)
		          AS audio_track_count
		 FROM book b
		 JOIN library l ON l.id = b.library_id
		 WHERE l.server_id = $1
		   AND b.uuid = ANY($2::uuid[])`,
		[serverId, [entry.audiobookUuid, entry.ebookUuid]],
	);
	const audiobook = result.rows.find(
		(row) => row.uuid === entry.audiobookUuid && row.media_type === "audiobook",
	);
	const ebook = result.rows.find(
		(row) => row.uuid === entry.ebookUuid && row.media_type === "ebook",
	);
	if (!audiobook || !ebook) throw new Error("Manifest source was not found");
	if (
		audiobook.duplicate_of_book_id !== null ||
		ebook.duplicate_of_book_id !== null
	) {
		throw new Error(
			"Manifest source is a grouped copy, not the canonical book",
		);
	}
	if (Number(audiobook.audio_track_count) !== 1) {
		throw new Error(
			`Audiobook ${entry.audiobookUuid} has ${audiobook.audio_track_count} tracks`,
		);
	}
	return { audiobookId: Number(audiobook.id), ebookId: Number(ebook.id) };
}

async function importEntry(
	manifest: ImportManifest,
	entry: ImportEntry,
): Promise<Record<string, unknown>> {
	await canonicalSources(manifest.serverId, entry);
	const pairing = await readListenService.associate({
		publicationUuid: entry.audiobookUuid,
		candidateUuid: entry.ebookUuid,
		createdByUserId: manifest.requestedByUserId,
		serverId: manifest.serverId,
		scope: "ALL",
	});
	const current = await readListenService.getPairForManagement(
		pairing.id,
		manifest.serverId,
		"ALL",
	);
	if (current.alignment.status === "ready") {
		return { status: "already-aligned", pairUuid: pairing.id };
	}
	if (
		current.generation?.status === "queued" ||
		current.generation?.status === "running"
	) {
		return {
			status: "already-running",
			pairUuid: pairing.id,
			taskId: current.generation.taskId,
		};
	}
	const bytes = new Uint8Array(await fs.readFile(entry.srtPath));
	const generation = await readListenService.generateAlignment(
		pairing.id,
		manifest.requestedByUserId,
		manifest.serverId,
		"ALL",
		{
			mode: "timed-text",
			verifyTimedText: false,
			timedTextUploads: [{ filename: path.basename(entry.srtPath), bytes }],
		},
	);
	return {
		status: generation.reused ? "already-running" : "queued",
		pairUuid: pairing.id,
		taskId: generation.taskId,
	};
}

const manifest = JSON.parse(
	await fs.readFile(manifestArg(), "utf8"),
) as unknown;
validateManifest(manifest);

const results: Record<string, unknown>[] = [];
try {
	for (const [index, entry] of manifest.entries.entries()) {
		const source = {
			index,
			audiobookUuid: entry.audiobookUuid,
			audiobookTitle: entry.expectedAudiobookTitle ?? null,
			ebookUuid: entry.ebookUuid,
			ebookTitle: entry.expectedEbookTitle ?? null,
		};
		let row: Record<string, unknown>;
		try {
			row = { ...source, ...(await importEntry(manifest, entry)) };
		} catch (error) {
			row = {
				...source,
				status: "error",
				error: error instanceof Error ? error.message : String(error),
			};
		}
		results.push(row);
		console.log(JSON.stringify(row));
	}
	console.log(JSON.stringify({ imported: results.length, results }, null, 2));
} finally {
	await pool.end();
}

// The read/listen service initializes BullMQ connections that intentionally keep
// the API process alive. This is a one-shot operational script, so terminate once
// PostgreSQL is closed and every result has been written to stdout.
process.exit(0);
