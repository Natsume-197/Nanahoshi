import type { TopHit } from "./search.model";

// Pure cross-type re-ranking, shared by the server (search.top endpoint used
// by the header dropdown) and the web search page (which ranks the section
// queries it already fetched, so it never re-runs the searches server-side).
// Keep this module free of server-only imports.

// Provider scores (PGroonga vs ES) aren't comparable across pools, so ranking
// uses a uniform name-match score plus a per-type weight: primary content
// (series/books) outranks social entities (collections/users) on equal match.
const TYPE_WEIGHT: Record<TopHit["type"], number> = {
	series: 1.15,
	book: 1.0,
	author: 0.95,
	audiobook: 0.9,
	collection: 0.75,
	user: 0.7,
};

function normalize(text: string): string {
	return text.normalize("NFKC").toLowerCase().trim();
}

function matchScore(name: string | null | undefined, query: string): number {
	if (!name) return 10;
	const n = normalize(name);
	if (n === query) return 100;
	if (n.startsWith(query)) return 70;
	// Word-boundary containment beats mid-word substring.
	if (n.includes(` ${query}`) || n.includes(`　${query}`)) return 45;
	if (n.includes(query)) return 30;
	// The engine matched a secondary field (description, author, romaji...).
	return 10;
}

type AuthorRef = { id?: number | null; name: string };

export type TopResultPools = {
	books: {
		uuid: string;
		title?: string | null;
		titleRomaji?: string | null;
		filename: string;
		cover?: string | null;
		authors?: AuthorRef[] | null;
		amazonReviewCount?: number | null;
	}[];
	series: {
		uuid: string;
		name: string;
		aliases?: string[];
		cover: string | null;
		bookCount: number;
		author?: { uuid: string; name: string } | null;
	}[];
	authors: { uuid: string; name: string; bookCount: number }[];
	audiobooks: {
		uuid: string;
		title?: string | null;
		filename: string;
		cover?: string | null;
		authors?: AuthorRef[] | null;
	}[];
	collections: {
		id: string;
		name: string;
		ownerUsername: string | null;
		previewCovers?: string[] | null;
		bookCount?: number | null;
	}[];
	users: {
		username: string | null;
		name: string;
		displayUsername: string | null;
		image: string | null;
		followerCount?: number | null;
	}[];
};

type Candidate = {
	hit: TopHit;
	// Every name the engine may have matched on; the best one drives the score.
	names: (string | null | undefined)[];
	popularity?: number;
};

export function rankTopResults(
	pools: TopResultPools,
	query: string,
	limit: number,
): TopHit[] {
	const candidates: Candidate[] = [
		...pools.books.map((b) => ({
			hit: {
				type: "book" as const,
				uuid: b.uuid,
				title: b.title ?? null,
				filename: b.filename,
				cover: b.cover ?? null,
				authors: b.authors ?? [],
			},
			names: [b.title, b.titleRomaji, ...(b.authors ?? []).map((a) => a.name)],
			popularity: b.amazonReviewCount ?? 0,
		})),
		...pools.series.map((s) => ({
			hit: {
				type: "series" as const,
				uuid: s.uuid,
				name: s.name,
				cover: s.cover,
				bookCount: s.bookCount,
				author: s.author ?? null,
			},
			names: [s.name, ...(s.aliases ?? [])],
			popularity: s.bookCount,
		})),
		...pools.authors.map((a) => ({
			hit: {
				type: "author" as const,
				uuid: a.uuid,
				name: a.name,
				bookCount: a.bookCount,
			},
			names: [a.name],
			popularity: a.bookCount,
		})),
		...pools.audiobooks.map((ab) => ({
			hit: {
				type: "audiobook" as const,
				uuid: ab.uuid,
				title: ab.title ?? null,
				filename: ab.filename,
				cover: ab.cover ?? null,
				authors: ab.authors ?? [],
			},
			names: [ab.title, ...(ab.authors ?? []).map((a) => a.name)],
		})),
		...pools.collections.map((c) => ({
			hit: {
				type: "collection" as const,
				id: c.id,
				name: c.name,
				ownerUsername: c.ownerUsername,
				previewCovers: c.previewCovers ?? [],
			},
			names: [c.name],
			popularity: c.bookCount ?? 0,
		})),
		...pools.users.map((u) => ({
			hit: {
				type: "user" as const,
				username: u.username,
				name: u.name,
				displayUsername: u.displayUsername,
				image: u.image,
			},
			names: [u.name, u.username, u.displayUsername],
			popularity: u.followerCount ?? 0,
		})),
	];

	const normalizedQuery = normalize(query);
	return candidates
		.map(({ hit, names, popularity = 0 }) => {
			const best = Math.max(
				...names.map((name) => matchScore(name, normalizedQuery)),
			);
			return {
				hit,
				score:
					best * TYPE_WEIGHT[hit.type] + Math.log1p(Math.max(popularity, 0)),
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((r) => r.hit);
}
