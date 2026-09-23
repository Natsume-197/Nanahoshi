// Read-only report: book covers whose source is Google Books, and which of them
// are Google's "image not available" card saved before the zoom fallback
// existed. Nothing is written; re-fetch the flagged books with a metadata
// refresh (or the tray's "Actualizar metadata") after deploying the fix.
// Run from apps/server so bun loads .env and relative cover paths resolve:
//   cd apps/server && bun run ../../packages/api/scripts/googlebooks-cover-report.ts
//   cd apps/server && bun run ../../packages/api/scripts/googlebooks-cover-report.ts --json > report.json

import { readFile } from "node:fs/promises";
import { pool } from "@nanahoshi/db";
import { isBlankNoImageCard } from "../src/routers/books/metadata/providers/googlebooks.provider";

type Row = {
	uuid: string;
	title: string | null;
	cover: string | null;
	serverId: string;
	volumeId: string | null;
};

const json = process.argv.includes("--json");

const { rows } = await pool.query<Row>(`
	SELECT
		b.uuid,
		bm.title,
		bm.cover,
		l.server_id AS "serverId",
		(
			SELECT m->>'providerId'
			FROM jsonb_array_elements(COALESCE(es.matched, '[]'::jsonb)) m
			WHERE m->>'provider' = 'googlebooks'
			LIMIT 1
		) AS "volumeId"
	FROM book_metadata bm
	JOIN book b ON b.id = bm.book_id
	JOIN library l ON l.id = b.library_id
	LEFT JOIN enrichment_state es ON es.book_id = b.id
	WHERE bm.field_sources->'cover'->>'p' = 'googlebooks'
	ORDER BY l.server_id, bm.title
`);

const placeholders: Row[] = [];
const missingFiles: Row[] = [];
for (const row of rows) {
	if (!row.cover) {
		missingFiles.push(row);
		continue;
	}
	const bytes = await readFile(row.cover).catch(() => null);
	if (!bytes) {
		missingFiles.push(row);
		continue;
	}
	// Stored covers are re-encoded by the ingest worker, so the format is gone.
	if (await isBlankNoImageCard(bytes, { requirePng: false })) {
		placeholders.push(row);
	}
}

const summary = {
	googlebooksCovers: rows.length,
	placeholders: placeholders.length,
	unreadableFiles: missingFiles.length,
};

if (json) {
	console.log(JSON.stringify({ summary, placeholders, missingFiles }, null, 2));
} else {
	console.log("Google Books cover report (read-only)");
	console.log(
		`  covers sourced from googlebooks: ${summary.googlebooksCovers}`,
	);
	console.log(`  "image not available" cards:     ${summary.placeholders}`);
	console.log(`  cover file missing/unreadable:   ${summary.unreadableFiles}`);
	for (const row of placeholders) {
		console.log(
			`  - ${row.uuid}  ${row.title ?? "(untitled)"}  volume=${row.volumeId ?? "?"}`,
		);
	}
}

await pool.end();
