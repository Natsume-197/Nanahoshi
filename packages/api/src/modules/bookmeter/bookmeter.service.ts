import { LIST_STATUSES, type ListStatus } from "../../constants";
import { BadRequestError, NotFoundError } from "../../errors";
import { logger } from "../../lib/logger";
import {
	type BookmeterBook,
	type BookmeterList,
	BookmeterUserNotFoundError,
	bookmeterClient,
	parseBookmeterUserId,
} from "./bookmeter.client";
import { bookmeterRepository } from "./bookmeter.repository";

const log = logger.child({ component: "bookmeter-service" });

export const LIST_TO_STATUS: Record<BookmeterList, ListStatus> = {
	read: LIST_STATUSES.COMPLETED,
	reading: LIST_STATUSES.READING,
	stacked: LIST_STATUSES.BACKLOG,
	wish: LIST_STATUSES.WANT_TO_READ,
};

// When one work appears in several lists (or matches several editions),
// the strongest signal wins.
const STATUS_PRIORITY: Record<ListStatus, number> = {
	[LIST_STATUSES.COMPLETED]: 3,
	[LIST_STATUSES.READING]: 2,
	[LIST_STATUSES.BACKLOG]: 1,
	[LIST_STATUSES.WANT_TO_READ]: 0,
};

export type BookmeterSyncResult = {
	fetched: number;
	matched: number;
	added: number;
};

export const normalizeTitle = (title: string) =>
	title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

const comparableTitle = (title: string) =>
	normalizeTitle(title).replace(/[\p{P}\p{S}\s]/gu, "");

function titleSimilarity(left: string, right: string): number {
	const a = comparableTitle(left);
	const b = comparableTitle(right);
	if (a === b) return 1;
	if (a.length < 2 || b.length < 2) return 0;

	const aPairs = new Map<string, number>();
	for (let i = 0; i < a.length - 1; i++) {
		const pair = a.slice(i, i + 2);
		aPairs.set(pair, (aPairs.get(pair) ?? 0) + 1);
	}

	let intersection = 0;
	for (let i = 0; i < b.length - 1; i++) {
		const pair = b.slice(i, i + 2);
		const available = aPairs.get(pair) ?? 0;
		if (available > 0) {
			intersection++;
			aPairs.set(pair, available - 1);
		}
	}

	return (2 * intersection) / (a.length + b.length - 2);
}

type AmazonIdMatch = {
	bookId: number;
	amazonId: string;
	title?: string | null;
};

function selectBestAmazonMatch(
	matches: AmazonIdMatch[],
	remoteTitle: string,
): AmazonIdMatch | undefined {
	let best: AmazonIdMatch | undefined;
	let bestScore = -1;
	for (const match of matches) {
		const score = match.title ? titleSimilarity(remoteTitle, match.title) : 0;
		if (
			!best ||
			score > bestScore ||
			(score === bestScore && match.bookId < best.bookId)
		) {
			best = match;
			bestScore = score;
		}
	}
	return best;
}

function parseSyncResult(json: string | null): BookmeterSyncResult | null {
	if (!json) return null;
	try {
		const parsed = JSON.parse(json) as Partial<BookmeterSyncResult>;
		return {
			fetched: Number(parsed.fetched ?? 0),
			matched: Number(parsed.matched ?? 0),
			added: Number(parsed.added ?? 0),
		};
	} catch {
		return null;
	}
}

export async function getBookmeterStatus(userId: string) {
	const link = await bookmeterRepository.getLink(userId);
	return {
		bookmeterUserId: link?.bookmeterUserId ?? null,
		lastSyncedAt: link?.bookmeterLastSyncedAt?.toISOString() ?? null,
		lastSyncResult: parseSyncResult(link?.bookmeterLastSyncResult ?? null),
	};
}

export async function getBookmeterStatusOrThrow(userId: string) {
	const status = await getBookmeterStatus(userId);
	if (!status.bookmeterUserId) {
		throw new NotFoundError("No Bookmeter account linked");
	}
	return status;
}

/** Validates the profile against bookmeter.com, stores the link and returns it. */
export async function linkBookmeter(userId: string, input: string) {
	const bookmeterUserId = parseBookmeterUserId(input);
	if (!bookmeterUserId) {
		throw new BadRequestError(
			"Expected a Bookmeter user id or profile URL (bookmeter.com/users/…)",
		);
	}
	try {
		await bookmeterClient.validateUser(bookmeterUserId);
	} catch (err) {
		if (err instanceof BookmeterUserNotFoundError) {
			throw new NotFoundError("Bookmeter profile not found or not public");
		}
		throw err;
	}
	await bookmeterRepository.setLink(userId, bookmeterUserId);
	return { bookmeterUserId };
}

export async function unlinkBookmeter(userId: string) {
	await bookmeterRepository.setLink(userId, null);
}

export function resolveShelfEntries(
	books: BookmeterBook[],
	matchesByAmazonId: AmazonIdMatch[],
	matchesByTitle: Array<{ bookId: number; title: string }>,
): Array<{ bookId: number; status: ListStatus }> {
	// Strongest status per remote book, keyed by amazon id / normalized title.
	const remoteByAmazonId = new Map<
		string,
		{ status: ListStatus; title: string }
	>();
	const statusByTitle = new Map<string, ListStatus>();
	for (const remote of books) {
		const status = LIST_TO_STATUS[remote.list];
		if (remote.amazonId) {
			const prev = remoteByAmazonId.get(remote.amazonId);
			if (!prev || STATUS_PRIORITY[status] > STATUS_PRIORITY[prev.status]) {
				remoteByAmazonId.set(remote.amazonId, { status, title: remote.title });
			}
		} else {
			const key = normalizeTitle(remote.title);
			const prev = statusByTitle.get(key);
			if (!prev || STATUS_PRIORITY[status] > STATUS_PRIORITY[prev]) {
				statusByTitle.set(key, status);
			}
		}
	}

	const statusByBookId = new Map<number, ListStatus>();
	const assign = (bookId: number, status: ListStatus | undefined) => {
		if (!status) return;
		const prev = statusByBookId.get(bookId);
		if (!prev || STATUS_PRIORITY[status] > STATUS_PRIORITY[prev]) {
			statusByBookId.set(bookId, status);
		}
	};

	const amazonMatchesById = new Map<string, AmazonIdMatch[]>();
	for (const match of matchesByAmazonId) {
		const candidates = amazonMatchesById.get(match.amazonId) ?? [];
		candidates.push(match);
		amazonMatchesById.set(match.amazonId, candidates);
	}
	for (const [amazonId, remote] of remoteByAmazonId) {
		const best = selectBestAmazonMatch(
			amazonMatchesById.get(amazonId) ?? [],
			remote.title,
		);
		if (best) assign(best.bookId, remote.status);
	}

	const bestTitleMatchByTitle = new Map<
		string,
		{ bookId: number; title: string }
	>();
	for (const match of matchesByTitle) {
		const key = normalizeTitle(match.title);
		const best = bestTitleMatchByTitle.get(key);
		if (!best || match.bookId < best.bookId) {
			bestTitleMatchByTitle.set(key, match);
		}
	}
	for (const [title, match] of bestTitleMatchByTitle) {
		assign(match.bookId, statusByTitle.get(title));
	}

	return [...statusByBookId].map(([bookId, status]) => ({ bookId, status }));
}

export async function syncUser(userId: string): Promise<BookmeterSyncResult> {
	const link = await bookmeterRepository.getLink(userId);
	if (!link?.bookmeterUserId) {
		throw new NotFoundError("No Bookmeter account linked");
	}

	const books = await bookmeterClient.fetchAllLists(link.bookmeterUserId);
	const serverIds = await bookmeterRepository.getUserServerIds(userId);

	let entries: Array<{ bookId: number; status: ListStatus }> = [];
	if (books.length > 0 && serverIds.length > 0) {
		const amazonIds = [
			...new Set(books.flatMap((b) => (b.amazonId ? [b.amazonId] : []))),
		];
		// ASIN match is authoritative; title match only covers books Bookmeter
		// has no Amazon link for.
		const titles = [
			...new Set(
				books.flatMap((b) => (b.amazonId ? [] : [normalizeTitle(b.title)])),
			),
		];
		const [byAmazonId, byTitle] = await Promise.all([
			bookmeterRepository.findBooksByAmazonIds(amazonIds, serverIds),
			bookmeterRepository.findBooksByTitles(titles, serverIds),
		]);
		entries = resolveShelfEntries(books, byAmazonId, byTitle);
	}

	const added = await bookmeterRepository.insertShelfIfAbsent(userId, entries);

	const result = { fetched: books.length, matched: entries.length, added };
	await bookmeterRepository.recordSyncResult(userId, JSON.stringify(result));
	log.info({ userId, ...result }, "Bookmeter sync finished");
	return result;
}

export async function syncAllLinkedUsers(): Promise<void> {
	const userIds = await bookmeterRepository.listLinkedUserIds();
	for (const userId of userIds) {
		try {
			await syncUser(userId);
		} catch (err) {
			// A broken/private profile must not block the other users.
			log.error({ err, userId }, "Bookmeter sync failed for user");
		}
	}
}
