import { LIST_STATUSES, type ListStatus } from "../../constants";
import { BadRequestError, NotFoundError } from "../../errors";
import { logger } from "../../lib/logger";
import { assessCatalogIdentity } from "../catalogIdentity";
import { isValidAsin, isValidIsbn10 } from "../identifiers";
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

type AmazonIdMatch = {
	bookId: number;
	amazonId: string;
	title: string | null;
	titleRomaji: string | null;
	authors: string[];
};

type TitleMatch = { bookId: number; title: string; authors: string[] };

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
	matchesByTitle: TitleMatch[],
): Array<{ bookId: number; status: ListStatus }> {
	const statusByBookId = new Map<number, ListStatus>();
	const assign = (bookId: number, status: ListStatus | undefined) => {
		if (!status) return;
		const prev = statusByBookId.get(bookId);
		if (!prev || STATUS_PRIORITY[status] > STATUS_PRIORITY[prev]) {
			statusByBookId.set(bookId, status);
		}
	};

	for (const remote of books) {
		const remoteEvidence = {
			kind: "book" as const,
			title: remote.title,
			authors: remote.author ? [remote.author] : [],
			...(remote.amazonId && isValidAsin(remote.amazonId)
				? { asin: remote.amazonId }
				: remote.amazonId && isValidIsbn10(remote.amazonId)
					? { isbn10: remote.amazonId }
					: {}),
		};
		const candidates = remote.amazonId
			? matchesByAmazonId.filter((match) => match.amazonId === remote.amazonId)
			: matchesByTitle.filter(
					(match) =>
						normalizeTitle(match.title) === normalizeTitle(remote.title),
				);
		const confirmedBookIds = new Set<number>();
		for (const candidate of candidates) {
			const localEvidence = {
				kind: "book" as const,
				title: candidate.title,
				titleRomaji:
					"titleRomaji" in candidate ? candidate.titleRomaji : undefined,
				authors: candidate.authors,
				...(remote.amazonId && isValidAsin(remote.amazonId)
					? { asin: remote.amazonId }
					: remote.amazonId && isValidIsbn10(remote.amazonId)
						? { isbn10: remote.amazonId }
						: {}),
			};
			if (
				assessCatalogIdentity(remoteEvidence, localEvidence).status ===
				"confirmed"
			)
				confirmedBookIds.add(candidate.bookId);
		}
		// One provider id/title resolving to several distinct Logical Editions is
		// ambiguous. Never choose the lowest database id as a silent tie-break.
		if (confirmedBookIds.size === 1) {
			assign([...confirmedBookIds][0] as number, LIST_TO_STATUS[remote.list]);
		}
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
