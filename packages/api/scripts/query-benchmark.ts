// Query benchmark harness: seeds a throwaway org at prod scale (~40k books)
// and measures the real repository/provider code paths (book detail, search,
// catalog lists). Run from apps/server so bun loads .env:
//   cd apps/server && bun run ../../packages/api/scripts/query-benchmark.ts seed
//   cd apps/server && bun run ../../packages/api/scripts/query-benchmark.ts run --label baseline --out /tmp/baseline.json
//   cd apps/server && bun run ../../packages/api/scripts/query-benchmark.ts compare /tmp/baseline.json /tmp/after.json
//   cd apps/server && bun run ../../packages/api/scripts/query-benchmark.ts clean

import { pool } from "@nanahoshi-v2/db";

const ORG_ID = "qbench-org";
const BOOKS = 40_000;
const AUTHORS = 8_000;
const SERIES = 4_500;
const PUBLISHERS = 250;
const GENRES = 40;
const TAGS = 900;

// ---------------------------------------------------------------- seeded PRNG
let prngState = 197;
function rand(): number {
	prngState |= 0;
	prngState = (prngState + 0x6d2b79f5) | 0;
	let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number) =>
	min + Math.floor(rand() * (max - min + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)] as T;

// ------------------------------------------------------------------ word pools
const EN_WORDS =
	"chronicle shadow ember tide harvest lantern hollow crimson winter garden orchid saga whisper iron velvet echo frontier sable meridian aurora citadel reverie thorn quill parchment vagrant sword sorcery academy drama nights everyday cooking realm dominion pact covenant relic wanderer".split(
		" ",
	);
const JP_WORDS =
	"魔法 学園 冒険 物語 世界 少女 剣 王国 異世界 転生 勇者 魔王 図書館 夜空 花嫁 迷宮 竜 皇女 錬金術 幽霊 桜 約束 旅路 記憶 星屑".split(
		" ",
	);
const SURNAMES =
	"Takeda Hoshino Ayasato Kurusu Minakami Shirogane Amamiya Kisaragi Fujimiya Tachibana Karasuma Hiiragi Otonashi Yukimura Saotome Ichijou Kannagi Tsukishiro".split(
		" ",
	);
const GIVEN =
	"Ren Yui Sora Akira Hikari Tsumugi Itsuki Nagisa Kaede Rin Aoi Haruto Mio Shun Sayo Chika Reo Nao".split(
		" ",
	);

// Controlled-frequency tokens the benchmark searches for.
const TOKEN_RARE = "zephyrion"; // ~20 titles
const TOKEN_MEDIUM = "kagenova"; // ~120 titles + ~400 descriptions
const TOKEN_COMMON = "storia"; // ~5k descriptions + ~800 titles
const TOKEN_AUTHOR = "Aozaki"; // ~25 author surnames
const TOKEN_SERIES = "kagerou"; // ~300 series names

const sentence = () => {
	const words: string[] = [];
	const n = randInt(8, 14);
	for (let i = 0; i < n; i++)
		words.push(rand() < 0.25 ? pick(JP_WORDS) : pick(EN_WORDS));
	return `${words.join(" ")}.`;
};

// ------------------------------------------------------------------- helpers
async function bulkInsert(
	table: string,
	columns: string[],
	types: string[],
	rows: unknown[][],
	returning?: string,
): Promise<unknown[]> {
	const out: unknown[] = [];
	const BATCH = 2_000;
	for (let i = 0; i < rows.length; i += BATCH) {
		const batch = rows.slice(i, i + BATCH);
		const params = columns.map((_, c) => batch.map((r) => r[c]));
		const unnests = types.map((t, c) => `$${c + 1}::${t}[]`).join(", ");
		const res = await pool.query(
			`INSERT INTO ${table} (${columns.join(", ")}) SELECT * FROM unnest(${unnests})${returning ? ` RETURNING ${returning}` : ""}`,
			params,
		);
		if (returning) out.push(...res.rows);
	}
	return out;
}

async function findOrg(): Promise<boolean> {
	const r = await pool.query("SELECT id FROM organization WHERE id = $1", [
		ORG_ID,
	]);
	return r.rows.length > 0;
}

// ---------------------------------------------------------------------- seed
async function seed() {
	if (await findOrg()) {
		console.log(`org ${ORG_ID} already exists — run 'clean' first to reseed`);
		return;
	}
	const t0 = performance.now();
	await pool.query(
		"INSERT INTO organization (id, name, slug, created_at) VALUES ($1, 'qbench', $1, now())",
		[ORG_ID],
	);
	const libIds: number[] = [];
	for (const name of ["qbench-main", "qbench-side"]) {
		const r = await pool.query(
			"INSERT INTO library (name, server_id, media_type, created_at) VALUES ($1, $2, 'ebook', now()) RETURNING id",
			[name, ORG_ID],
		);
		libIds.push(Number(r.rows[0].id));
	}

	console.log("seeding authors/series/publishers/genres/tags…");
	const authorNames = new Set<string>();
	while (authorNames.size < AUTHORS) {
		const surname =
			authorNames.size < 25 ? TOKEN_AUTHOR : pick(SURNAMES) + pick(GIVEN);
		authorNames.add(`${surname} ${pick(GIVEN)}${randInt(1, 9999)}`);
	}
	const authorIds = (
		await bulkInsert(
			"author",
			["name", "server_id"],
			["text", "text"],
			[...authorNames].map((n) => [n, ORG_ID]),
			"id",
		)
	).map((r) => Number((r as { id: number }).id));

	const seriesNames = new Set<string>();
	while (seriesNames.size < SERIES) {
		const base = `${pick(EN_WORDS)} ${pick(JP_WORDS)} ${pick(EN_WORDS)}`;
		seriesNames.add(
			seriesNames.size < 300
				? `${TOKEN_SERIES} ${base} ${seriesNames.size}`
				: `${base} ${seriesNames.size}`,
		);
	}
	const seriesRows = (await bulkInsert(
		"series",
		["name", "server_id"],
		["text", "text"],
		[...seriesNames].map((n) => [n, ORG_ID]),
		"id, uuid, name",
	)) as { id: number; uuid: string; name: string }[];

	const publisherIds = (
		await bulkInsert(
			"publisher",
			["name", "server_id"],
			["text", "text"],
			Array.from({ length: PUBLISHERS }, (_, i) => [
				`${pick(EN_WORDS)} ${pick(EN_WORDS)} Press ${i}`,
				ORG_ID,
			]),
			"id",
		)
	).map((r) => Number((r as { id: number }).id));

	const genreRows = (await bulkInsert(
		"genre",
		["name", "server_id"],
		["text", "text"],
		Array.from({ length: GENRES }, (_, i) => [
			`genre-${pick(EN_WORDS)}-${i}`,
			ORG_ID,
		]),
		"id, uuid",
	)) as { id: number; uuid: string }[];

	const tagIds = (
		await bulkInsert(
			"tag",
			["name", "server_id"],
			["text", "text"],
			Array.from({ length: TAGS }, (_, i) => [
				`tag-${pick(JP_WORDS)}-${i}`,
				ORG_ID,
			]),
			"id",
		)
	).map((r) => Number((r as { id: number }).id));

	console.log(`seeding ${BOOKS} books…`);
	const now = Date.now();
	const bookRows: unknown[][] = [];
	for (let i = 0; i < BOOKS; i++) {
		const createdAt = new Date(
			now - randInt(0, 3 * 365 * 24 * 3600) * 1000,
		).toISOString();
		bookRows.push([
			`book-${i}.epub`,
			`s2:qbench-${i}`,
			crypto.randomUUID(),
			libIds[rand() < 0.9 ? 0 : 1],
			"ebook",
			createdAt,
			randInt(200, 40_000),
		]);
	}
	const bookIds = (
		await bulkInsert(
			"book",
			[
				"filename",
				"filehash",
				"uuid",
				"library_id",
				"media_type",
				"created_at",
				"filesize_kb",
			],
			["text", "text", "uuid", "bigint", "text", "timestamptz", "bigint"],
			bookRows,
			"id",
		)
	).map((r) => Number((r as { id: number }).id));

	// ~4% hidden duplicate copies pointing at a canonical in the first half.
	const dupCount = Math.floor(BOOKS * 0.04);
	const canonicalCutoff = Math.floor(BOOKS / 2);
	const dupIds = bookIds.slice(BOOKS - dupCount);
	const dupPairs = dupIds.map(
		(id) => [id, bookIds[randInt(0, canonicalCutoff - 1)]] as const,
	);
	await pool.query(
		`UPDATE book b SET duplicate_of_book_id = m.target
		 FROM (SELECT * FROM unnest($1::bigint[], $2::bigint[]) AS t(id, target)) m
		 WHERE b.id = m.id`,
		[dupPairs.map((p) => p[0]), dupPairs.map((p) => p[1])],
	);

	console.log("seeding metadata…");
	const metaRows: unknown[][] = [];
	const authorLinks: unknown[][] = [];
	const seriesLinks: unknown[][] = [];
	const genreLinks: unknown[][] = [];
	const tagLinks: unknown[][] = [];
	let rareLeft = 20;
	let medTitleLeft = 120;
	const seriesProgress = new Map<number, number>();
	for (let i = 0; i < BOOKS; i++) {
		const id = bookIds[i] as number;
		let title = `${pick(EN_WORDS)} ${pick(JP_WORDS)} ${pick(EN_WORDS)} ${i}`;
		if (rareLeft > 0 && rand() < 0.001) {
			title = `${TOKEN_RARE} ${title}`;
			rareLeft--;
		} else if (medTitleLeft > 0 && rand() < 0.004) {
			title = `${TOKEN_MEDIUM} ${title}`;
			medTitleLeft--;
		} else if (rand() < 0.02) {
			title = `${TOKEN_COMMON} ${title}`;
		}
		const inSeries = rand() < 0.75;
		if (inSeries) {
			const s = pick(seriesRows);
			const pos = (seriesProgress.get(s.id) ?? 0) + 1;
			seriesProgress.set(s.id, pos);
			title = `${s.name.replace(/ \d+$/, "")} Vol. ${pos}`;
			seriesLinks.push([id, s.id, pos]);
		}
		let description: string | null = null;
		if (rand() < 0.65) {
			const parts: string[] = [];
			const n = randInt(2, 5);
			for (let k = 0; k < n; k++) parts.push(sentence());
			if (rand() < 0.2) parts.push(`A ${TOKEN_COMMON} for the ages.`);
			if (rand() < 0.015) parts.push(`The ${TOKEN_MEDIUM} arc continues.`);
			description = parts.join(" ");
		}
		metaRows.push([
			id,
			title.slice(0, 255),
			rand() < 0.3 ? sentence().slice(0, 255) : null,
			description,
			`20${randInt(10, 25)}-${String(randInt(1, 12)).padStart(2, "0")}-${String(randInt(1, 28)).padStart(2, "0")}`,
			rand() < 0.8 ? "ja" : "en",
			randInt(120, 700),
			rand() < 0.8 ? pick(publisherIds) : null,
			rand() < 0.5 ? Math.round((3 + rand() * 2) * 10) / 10 : null,
			rand() < 0.5 ? randInt(1, 4000) : null,
			// ~90% of books have covers in prod; cover-picking subqueries scan
			// until a match, so an all-NULL column makes them look 10x slower.
			rand() < 0.9 ? `qbench/${id}.avif` : null,
			rand() < 0.9 ? "#4a5568" : null,
		]);
		const nAuthors = rand() < 0.75 ? 1 : 2;
		const seen = new Set<number>();
		for (let a = 0; a < nAuthors; a++) {
			const aid = pick(authorIds);
			if (seen.has(aid)) continue;
			seen.add(aid);
			authorLinks.push([id, aid, a === 0 ? "Author" : "Illustrator"]);
		}
		const nGenres = randInt(0, 5);
		const gSeen = new Set<number>();
		for (let g = 0; g < nGenres; g++) {
			const gr = pick(genreRows);
			if (gSeen.has(gr.id)) continue;
			gSeen.add(gr.id);
			genreLinks.push([id, gr.id]);
		}
		const nTags = randInt(0, 8);
		const tSeen = new Set<number>();
		for (let t = 0; t < nTags; t++) {
			const tid = pick(tagIds);
			if (tSeen.has(tid)) continue;
			tSeen.add(tid);
			tagLinks.push([id, tid]);
		}
	}

	await bulkInsert(
		"book_metadata",
		[
			"book_id",
			"title",
			"subtitle",
			"description",
			"published_date",
			"language_code",
			"page_count",
			"publisher_id",
			"amazon_rating",
			"amazon_review_count",
			"cover",
			"main_color",
		],
		[
			"bigint",
			"varchar",
			"varchar",
			"text",
			"date",
			"varchar",
			"int",
			"int",
			"float8",
			"int",
			"varchar",
			"varchar",
		],
		metaRows,
	);
	await bulkInsert(
		"book_author",
		["book_id", "author_id", "role"],
		["bigint", "bigint", "text"],
		authorLinks,
	);
	await bulkInsert(
		"book_series",
		["book_id", "series_id", "position"],
		["bigint", "bigint", "int"],
		seriesLinks,
	);
	await bulkInsert(
		"book_genre",
		["book_id", "genre_id"],
		["bigint", "bigint"],
		genreLinks,
	);
	await bulkInsert(
		"book_tag",
		["book_id", "tag_id"],
		["bigint", "bigint"],
		tagLinks,
	);

	await pool.query("ANALYZE");
	console.log(
		`seeded in ${((performance.now() - t0) / 1000).toFixed(1)}s: ${BOOKS} books, ${authorLinks.length} author links, ${genreLinks.length} genre links, ${tagLinks.length} tag links, ${seriesLinks.length} series links`,
	);
}

// Adds the per-user rows (reading progress, likes, shelf) the dashboard
// queries read. Idempotent — safe to run against an already-seeded org.
const USER_ID = "qbench-user";
async function augment() {
	if (!(await findOrg()))
		throw new Error("qbench org missing — run seed first");
	await pool.query(
		`INSERT INTO "user" (id, name, username, email, email_verified, created_at, updated_at)
		 VALUES ($1, 'qbench', 'qbench', 'qbench@example.invalid', true, now(), now())
		 ON CONFLICT (id) DO NOTHING`,
		[USER_ID],
	);
	const bookIds = (
		await pool.query(
			`SELECT b.id FROM book b JOIN library l ON l.id = b.library_id
			 WHERE l.server_id = $1 AND b.duplicate_of_book_id IS NULL
			 ORDER BY b.id LIMIT 600`,
			[ORG_ID],
		)
	).rows.map((r) => Number(r.id));

	await pool.query(
		`INSERT INTO reading_progress (user_id, book_id, status, explored_char_count, book_char_count, reading_time_seconds, last_read_at)
		 SELECT $1, id, 'reading', 5000, 90000, 1200, now() - (id % 90) * interval '1 day'
		 FROM unnest($2::bigint[]) AS t(id)
		 ON CONFLICT (user_id, book_id) DO NOTHING`,
		[USER_ID, bookIds.slice(0, 60)],
	);
	await pool.query(
		`INSERT INTO liked_book (user_id, book_id, server_id, created_at)
		 SELECT $1, id, $2, now() - (id % 200) * interval '1 hour'
		 FROM unnest($3::bigint[]) AS t(id)
		 ON CONFLICT DO NOTHING`,
		[USER_ID, ORG_ID, bookIds.slice(0, 300)],
	);
	await pool.query(
		`INSERT INTO user_book_shelf (user_id, book_id, status, updated_at)
		 SELECT $1, id, (ARRAY['want_to_read','backlog','reading','completed'])[1 + id % 4]::shelf_status, now() - (id % 120) * interval '1 hour'
		 FROM unnest($2::bigint[]) AS t(id)
		 ON CONFLICT DO NOTHING`,
		[USER_ID, bookIds.slice(0, 150)],
	);
	console.log("augmented: 60 reading_progress, 300 liked_book, 150 shelf rows");
}

async function clean() {
	await pool.query("DELETE FROM organization WHERE id = $1", [ORG_ID]);
	await pool.query(`DELETE FROM "user" WHERE id = $1`, [USER_ID]);
	console.log("qbench org + user deleted (FK cascade removed all rows)");
}

// ----------------------------------------------------------------- benchmark
type CaseResult = {
	name: string;
	iters: number;
	mean: number;
	p50: number;
	p95: number;
	min: number;
	max: number;
};

function summarize(name: string, samples: number[]): CaseResult {
	const s = [...samples].sort((a, b) => a - b);
	const at = (q: number) =>
		s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
	return {
		name,
		iters: s.length,
		mean: s.reduce((a, b) => a + b, 0) / s.length,
		p50: at(0.5),
		p95: at(0.95),
		min: s[0] as number,
		max: s[s.length - 1] as number,
	};
}

async function bench(
	name: string,
	iters: number,
	fn: (i: number) => Promise<unknown>,
): Promise<CaseResult> {
	for (let i = 0; i < 3; i++) await fn(i);
	const samples: number[] = [];
	for (let i = 0; i < iters; i++) {
		const t0 = performance.now();
		await fn(i);
		samples.push(performance.now() - t0);
	}
	const r = summarize(name, samples);
	console.log(
		`${name.padEnd(48)} p50 ${r.p50.toFixed(1).padStart(8)}ms  p95 ${r.p95.toFixed(1).padStart(8)}ms  mean ${r.mean.toFixed(1).padStart(8)}ms  (n=${iters})`,
	);
	return r;
}

async function run(label: string, out?: string) {
	if (!(await findOrg()))
		throw new Error("qbench org missing — run seed first");
	const { bookCreatedAtDesc, bookRepository } = await import(
		"../src/routers/books/book.repository"
	);
	const { search: provider } = await import(
		"../src/infrastructure/search/pgroonga/pgroonga.provider"
	);

	const libs = (
		await pool.query(
			"SELECT id FROM library WHERE server_id = $1 ORDER BY id",
			[ORG_ID],
		)
	).rows.map((r) => Number(r.id));
	const uuids = (
		await pool.query(
			`SELECT b.uuid FROM book b JOIN library l ON l.id = b.library_id
			 WHERE l.server_id = $1 ORDER BY random() LIMIT 400`,
			[ORG_ID],
		)
	).rows.map((r) => r.uuid as string);
	const seriesUuids = (
		await pool.query(
			"SELECT s.uuid FROM series s WHERE s.server_id = $1 ORDER BY random() LIMIT 100",
			[ORG_ID],
		)
	).rows.map((r) => r.uuid as string);
	const genreUuids = (
		await pool.query(
			"SELECT g.uuid FROM genre g WHERE g.server_id = $1 ORDER BY random() LIMIT 40",
			[ORG_ID],
		)
	).rows.map((r) => r.uuid as string);
	const tagUuids = (
		await pool.query(
			"SELECT t.uuid FROM tag t WHERE t.server_id = $1 ORDER BY random() LIMIT 40",
			[ORG_ID],
		)
	).rows.map((r) => r.uuid as string);
	const authorIds = (
		await pool.query(
			`SELECT DISTINCT ba.author_id AS id FROM book_author ba
			 JOIN author a ON a.id = ba.author_id WHERE a.server_id = $1 LIMIT 100`,
			[ORG_ID],
		)
	).rows.map((r) => Number(r.id));
	const publisherUuids = (
		await pool.query(
			"SELECT p.uuid FROM publisher p WHERE p.server_id = $1 ORDER BY random() LIMIT 40",
			[ORG_ID],
		)
	).rows.map((r) => r.uuid as string);

	const search = (query: string, extra: Record<string, unknown> = {}) =>
		provider.searchBooks({
			query,
			serverId: ORG_ID,
			accessibleLibraryIds: "ALL",
			...extra,
		});

	const results: CaseResult[] = [];
	const add = async (
		name: string,
		iters: number,
		fn: (i: number) => Promise<unknown>,
	) => results.push(await bench(name, iters, fn));

	await add("detail: getWithMetadata (ALL)", 200, (i) =>
		bookRepository.getWithMetadata(
			uuids[i % uuids.length] as string,
			ORG_ID,
			"ALL",
		),
	);
	await add("detail: getWithMetadata (scoped)", 100, (i) =>
		bookRepository.getWithMetadata(
			uuids[i % uuids.length] as string,
			ORG_ID,
			libs,
		),
	);
	await add(`search: common token ('${TOKEN_COMMON}')`, 20, () =>
		search(TOKEN_COMMON),
	);
	await add(`search: medium token ('${TOKEN_MEDIUM}')`, 30, () =>
		search(TOKEN_MEDIUM),
	);
	await add(`search: rare token ('${TOKEN_RARE}')`, 30, () =>
		search(TOKEN_RARE),
	);
	await add(`search: author name ('${TOKEN_AUTHOR.toLowerCase()}')`, 30, () =>
		search(TOKEN_AUTHOR.toLowerCase()),
	);
	await add("search: browse no query (exact count)", 20, () => search(""));
	await add("search: browse + language filter", 20, () =>
		search("", { filters: { languageCode: ["ja"] } }),
	);
	await add("search: scoped to one library", 30, () =>
		search(TOKEN_MEDIUM, { accessibleLibraryIds: [libs[0]] }),
	);
	await add(`searchSeries ('${TOKEN_SERIES}')`, 20, () =>
		provider.searchSeries({
			query: TOKEN_SERIES,
			serverId: ORG_ID,
			accessibleLibraryIds: "ALL",
		}),
	);
	await add(`searchAuthors ('${TOKEN_AUTHOR.toLowerCase()}')`, 30, () =>
		provider.searchAuthors({
			query: TOKEN_AUTHOR.toLowerCase(),
			serverId: ORG_ID,
			accessibleLibraryIds: "ALL",
		}),
	);
	await add("list: listRecent(20)", 50, () =>
		bookRepository.listRecent(20, ORG_ID, "ALL"),
	);
	await add("list: listPaginated page 1 (60)", 30, () =>
		bookRepository.listPaginated(ORG_ID, bookCreatedAtDesc, 60, 0, "ALL"),
	);
	await add("list: listPaginated deep (offset 3000)", 20, () =>
		bookRepository.listPaginated(ORG_ID, bookCreatedAtDesc, 60, 3000, "ALL"),
	);
	await add("entity: listBySeriesUuid", 50, (i) =>
		bookRepository.listBySeriesUuid(
			seriesUuids[i % seriesUuids.length] as string,
			ORG_ID,
			"ALL",
		),
	);
	await add("entity: listByAuthorId", 50, (i) =>
		bookRepository.listByAuthorId(
			authorIds[i % authorIds.length] as number,
			ORG_ID,
			60,
			0,
			"ALL",
		),
	);
	await add("entity: listByGenreUuid", 20, (i) =>
		bookRepository.listByGenreUuid(
			genreUuids[i % genreUuids.length] as string,
			ORG_ID,
			"ALL",
		),
	);
	await add("entity: listByTagUuid", 30, (i) =>
		bookRepository.listByTagUuid(
			tagUuids[i % tagUuids.length] as string,
			ORG_ID,
			"ALL",
		),
	);
	await add("entity: listByPublisherUuid", 30, (i) =>
		bookRepository.listByPublisherUuid(
			publisherUuids[i % publisherUuids.length] as string,
			ORG_ID,
			"ALL",
		),
	);

	// ── wave 2: catalog page, entity lists with counts, per-user dashboard ──
	const { seriesRepository } = await import(
		"../src/routers/series/series.repository"
	);
	const { authorRepository } = await import(
		"../src/routers/authors/author.repository"
	);
	const { genreRepository } = await import(
		"../src/routers/genres/genre.repository"
	);
	const { tagRepository } = await import("../src/routers/tags/tag.repository");
	const { readingProgressRepository } = await import(
		"../src/routers/reading-progress/reading-progress.repository"
	);
	const { likedBooksRepository } = await import(
		"../src/routers/liked-books/liked-books.repository"
	);
	const { bookShelfRepository } = await import(
		"../src/routers/book-shelf/book-shelf.repository"
	);

	const catalogOpts = (sort: "recent" | "title" | "author" | "rating") => ({
		mediaType: "all" as const,
		limit: 60,
		offset: 0,
		sort,
	});
	await add("catalog: listAllBooks recent", 30, () =>
		bookRepository.listAllBooks(ORG_ID, "ALL", catalogOpts("recent")),
	);
	await add("catalog: listAllBooks title", 20, () =>
		bookRepository.listAllBooks(ORG_ID, "ALL", catalogOpts("title")),
	);
	await add("catalog: listAllBooks author", 10, () =>
		bookRepository.listAllBooks(ORG_ID, "ALL", catalogOpts("author")),
	);
	await add("catalog: listAllBooks rating", 20, () =>
		bookRepository.listAllBooks(ORG_ID, "ALL", catalogOpts("rating")),
	);
	await add("catalog: listAllBooks title-search", 20, () =>
		bookRepository.listAllBooks(ORG_ID, "ALL", {
			...catalogOpts("recent"),
			query: TOKEN_MEDIUM,
		}),
	);
	await add("catalog: countAllBooks", 30, () =>
		bookRepository.countAllBooks(ORG_ID, "ALL", { mediaType: "all" }),
	);
	await add("catalog: countAllBooks title-search", 30, () =>
		bookRepository.countAllBooks(ORG_ID, "ALL", {
			mediaType: "all",
			query: TOKEN_MEDIUM,
		}),
	);
	await add("library: listByLibraryId title sort", 20, () =>
		bookRepository.listByLibraryId(libs[0] as number, ORG_ID, "ALL", {
			mediaType: "ebook",
			limit: 60,
			offset: 0,
			sort: "title",
		}),
	);
	await add("library: listByLibraryId quick-search", 20, () =>
		bookRepository.listByLibraryId(libs[0] as number, ORG_ID, "ALL", {
			mediaType: "ebook",
			limit: 60,
			offset: 0,
			sort: "recent",
			query: TOKEN_MEDIUM,
		}),
	);
	await add("catalog: availableFormats", 50, () =>
		bookRepository.availableFormats(ORG_ID, "ALL"),
	);
	await add("entity list: series listWithBookCount (name)", 20, () =>
		seriesRepository.listWithBookCount(ORG_ID, 30, 0, "name", "ALL"),
	);
	await add("entity list: series listWithBookCount (books)", 20, () =>
		seriesRepository.listWithBookCount(ORG_ID, 30, 0, "books", "ALL"),
	);
	await add("entity list: authors listWithBookCount", 20, () =>
		authorRepository.listWithBookCount(ORG_ID, { limit: 30, offset: 0 }, "ALL"),
	);
	await add("entity list: genres listWithBookCount", 20, () =>
		genreRepository.listWithBookCount(ORG_ID, 30, 0, "name", undefined, "ALL"),
	);
	await add("entity list: tags listWithBookCount", 20, () =>
		tagRepository.listWithBookCount(ORG_ID, 30, 0, "name", undefined, "ALL"),
	);
	await add("dashboard: listInProgress(20)", 50, () =>
		readingProgressRepository.listInProgress(USER_ID, 20, ORG_ID, "ALL"),
	);
	await add("dashboard: listLiked recent (40)", 50, () =>
		likedBooksRepository.listLiked(USER_ID, ORG_ID, "ALL", {
			limit: 40,
			offset: 0,
			sort: "recent",
		}),
	);
	await add("dashboard: shelf listByStatus reading", 50, () =>
		bookShelfRepository.listByStatus(USER_ID, ORG_ID, "ALL", "reading", 50),
	);

	const payload = { label, at: new Date().toISOString(), results };
	if (out) {
		await Bun.write(out, JSON.stringify(payload, null, 2));
		console.log(`\nwrote ${out}`);
	}
}

async function compare(beforePath: string, afterPath: string) {
	const before = JSON.parse(await Bun.file(beforePath).text());
	const after = JSON.parse(await Bun.file(afterPath).text());
	console.log(
		`${"case".padEnd(48)} ${"before p50".padStart(11)} ${"after p50".padStart(11)} ${"Δ".padStart(8)}   ${"before p95".padStart(11)} ${"after p95".padStart(11)} ${"Δ".padStart(8)}`,
	);
	for (const b of before.results as CaseResult[]) {
		const a = (after.results as CaseResult[]).find((r) => r.name === b.name);
		if (!a) continue;
		const d = (x: number, y: number) =>
			`${(((y - x) / x) * 100).toFixed(0)}%`.padStart(8);
		console.log(
			`${b.name.padEnd(48)} ${b.p50.toFixed(1).padStart(9)}ms ${a.p50.toFixed(1).padStart(9)}ms ${d(b.p50, a.p50)}   ${b.p95.toFixed(1).padStart(9)}ms ${a.p95.toFixed(1).padStart(9)}ms ${d(b.p95, a.p95)}`,
		);
	}
}

// ------------------------------------------------------------------- dispatch
const [cmd, ...rest] = process.argv.slice(2);
const argVal = (flag: string) => {
	const i = rest.indexOf(flag);
	return i >= 0 ? rest[i + 1] : undefined;
};

switch (cmd) {
	case "seed":
		await seed();
		await augment();
		break;
	case "augment":
		await augment();
		break;
	case "clean":
		await clean();
		break;
	case "run":
		await run(argVal("--label") ?? "run", argVal("--out"));
		break;
	case "compare":
		await compare(rest[0] as string, rest[1] as string);
		break;
	default:
		console.log("usage: query-benchmark.ts <seed|run|clean|compare>");
}
await pool.end();
process.exit(0);
