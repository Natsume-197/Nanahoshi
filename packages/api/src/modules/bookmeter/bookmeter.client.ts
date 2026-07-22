import { logger } from "../../lib/logger";

const log = logger.child({ component: "bookmeter-client" });

const BASE_URL = "https://bookmeter.com";
const USER_AGENT = "Nanahoshi (self-hosted library; bookmeter shelf sync)";
const REQUEST_TIMEOUT_MS = 15_000;
// Undocumented endpoint — pace politely and never page forever.
const PAGE_DELAY_MS = 400;
const MAX_PAGES_PER_LIST = 500;

export const BOOKMETER_LISTS = ["read", "reading", "stacked", "wish"] as const;
export type BookmeterList = (typeof BOOKMETER_LISTS)[number];

export type BookmeterBook = {
	list: BookmeterList;
	title: string;
	author: string | null;
	/** Amazon id (ASIN, or ISBN-10 for print editions) parsed from amazon_urls. */
	amazonId: string | null;
};

type BookmeterListResponse = {
	metadata?: { count?: number; limit?: number; offset?: number };
	resources?: Array<{
		author_name?: string;
		book?: {
			title?: string;
			amazon_urls?: Record<string, unknown>;
			author?: { name?: string };
		};
	}>;
};

const AMAZON_ID_RE =
	/(?:\/dp\/|\/gp\/product\/|\/ASIN\/|[?&]asin=)([A-Z0-9]{10})(?=[/?&#]|$)/i;

export function parseAmazonId(
	urls: Record<string, unknown> | undefined,
): string | null {
	if (!urls) return null;
	for (const value of Object.values(urls)) {
		if (typeof value !== "string") continue;
		const id = AMAZON_ID_RE.exec(value)?.[1];
		if (id) return id.toUpperCase();
	}
	return null;
}

/** Accepts a raw numeric id or a bookmeter profile URL; null when unparsable. */
export function parseBookmeterUserId(input: string): string | null {
	const trimmed = input.trim();
	if (/^\d{1,12}$/.test(trimmed)) return trimmed;
	return (
		/bookmeter\.com\/users\/(\d{1,12})(?=[/?#]|$)/.exec(trimmed)?.[1] ?? null
	);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchListPage(
	bookmeterUserId: string,
	list: BookmeterList,
	page: number,
): Promise<BookmeterListResponse> {
	const url = `${BASE_URL}/users/${bookmeterUserId}/books/${list}.json?page=${page}`;
	const response = await fetch(url, {
		headers: { "user-agent": USER_AGENT, accept: "application/json" },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (response.status === 404) {
		throw new BookmeterUserNotFoundError(bookmeterUserId);
	}
	if (!response.ok) {
		throw new Error(
			`Bookmeter responded ${response.status} for ${list} page ${page}`,
		);
	}
	return (await response.json()) as BookmeterListResponse;
}

export class BookmeterUserNotFoundError extends Error {
	constructor(bookmeterUserId: string) {
		super(`Bookmeter user ${bookmeterUserId} not found`);
	}
}

function toBooks(
	data: BookmeterListResponse,
	list: BookmeterList,
): BookmeterBook[] {
	const books: BookmeterBook[] = [];
	for (const resource of data.resources ?? []) {
		const title = resource.book?.title?.trim();
		if (!title) continue;
		books.push({
			list,
			title,
			author: resource.book?.author?.name ?? resource.author_name ?? null,
			amazonId: parseAmazonId(resource.book?.amazon_urls),
		});
	}
	return books;
}

export class BookmeterClient {
	/** Confirms the profile exists and is public; returns its read-book count. */
	async validateUser(bookmeterUserId: string): Promise<{ readCount: number }> {
		const data = await fetchListPage(bookmeterUserId, "read", 1);
		return { readCount: data.metadata?.count ?? 0 };
	}

	async fetchList(
		bookmeterUserId: string,
		list: BookmeterList,
	): Promise<BookmeterBook[]> {
		const books: BookmeterBook[] = [];
		for (let page = 1; page <= MAX_PAGES_PER_LIST; page++) {
			const data = await fetchListPage(bookmeterUserId, list, page);
			const pageBooks = toBooks(data, list);
			books.push(...pageBooks);

			const { count = 0, limit = 20, offset = 0 } = data.metadata ?? {};
			const done = pageBooks.length === 0 || offset + limit >= count;
			if (done) break;
			await sleep(PAGE_DELAY_MS);
		}
		return books;
	}

	async fetchAllLists(bookmeterUserId: string): Promise<BookmeterBook[]> {
		const books: BookmeterBook[] = [];
		for (const list of BOOKMETER_LISTS) {
			try {
				books.push(...(await this.fetchList(bookmeterUserId, list)));
			} catch (err) {
				if (err instanceof BookmeterUserNotFoundError) throw err;
				// One failing list (private wishlist, transient error) must not
				// abort the whole sync — the next run self-heals.
				log.warn(
					{ err, bookmeterUserId, list },
					"Failed to fetch bookmeter list",
				);
			}
			await sleep(PAGE_DELAY_MS);
		}
		return books;
	}
}

export const bookmeterClient = new BookmeterClient();
