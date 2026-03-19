import type { auth as authInstance } from "@nanahoshi-v2/auth";
import { Hono } from "hono";
import { opdsAuthMiddleware } from "./opds.auth";
import type { OpdsUser } from "./opds.model";
import {
	listAllBooks,
	listAuthors,
	listBooksByAuthor,
	listBooksBySeries,
	listRecentBooks,
	listSeries,
	searchAuthors,
	searchBooks,
	searchSeries,
} from "./opds.repository";
import {
	buildAcquisitionFeed,
	buildNavigationFeed,
	buildSearchDescription,
	buildSearchFeed,
} from "./opds.xml";

type Env = { Variables: { opdsUser: OpdsUser } };

function xmlResponse(
	c: { body: (data: string, init?: ResponseInit) => Response },
	xml: string,
) {
	return c.body(xml, {
		headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
	});
}

function parsePage(c: {
	req: { query: (key: string) => string | undefined };
}): number {
	const raw = Number(c.req.query("page"));
	return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

export function createOpdsApp(auth: typeof authInstance) {
	const app = new Hono<Env>();

	app.use("*", opdsAuthMiddleware(auth));

	// Root catalog
	app.get("/", (c) => {
		const feed = buildNavigationFeed(
			[
				{
					title: "All Books",
					href: "/opds/books",
					id: "urn:nanahoshi:books",
					content: "Browse all books alphabetically",
				},
				{
					title: "Recent Additions",
					href: "/opds/new",
					id: "urn:nanahoshi:new",
					content: "Recently added books",
				},
				{
					title: "Authors",
					href: "/opds/authors",
					id: "urn:nanahoshi:authors",
					content: "Browse by author",
				},
				{
					title: "Series",
					href: "/opds/series",
					id: "urn:nanahoshi:series",
					content: "Browse by series",
				},
			],
			{
				id: "urn:nanahoshi:root",
				title: "Nanahoshi Library",
				selfHref: "/opds",
				searchHref: "/opds/opensearch.xml",
			},
		);
		return xmlResponse(c, feed);
	});

	// OpenSearch description
	app.get("/opensearch.xml", (c) => {
		return c.body(buildSearchDescription(), {
			headers: {
				"Content-Type": "application/opensearchdescription+xml; charset=utf-8",
			},
		});
	});

	// Recent additions
	app.get("/new", async (c) => {
		const { organizationId } = c.get("opdsUser");
		const page = parsePage(c);
		const { books, hasMore } = await listRecentBooks(organizationId, page);

		const feed = buildAcquisitionFeed(books, {
			id: "urn:nanahoshi:new",
			title: "Recent Additions",
			selfHref: `/opds/new?page=${page}`,
			nextHref: hasMore ? `/opds/new?page=${page + 1}` : undefined,
			searchHref: "/opds/opensearch.xml",
		});
		return xmlResponse(c, feed);
	});

	// All books (alphabetical)
	app.get("/books", async (c) => {
		const { organizationId } = c.get("opdsUser");
		const page = parsePage(c);
		const { books, hasMore } = await listAllBooks(organizationId, page);

		const feed = buildAcquisitionFeed(books, {
			id: "urn:nanahoshi:books",
			title: "All Books",
			selfHref: `/opds/books?page=${page}`,
			nextHref: hasMore ? `/opds/books?page=${page + 1}` : undefined,
			searchHref: "/opds/opensearch.xml",
		});
		return xmlResponse(c, feed);
	});

	// Authors list
	app.get("/authors", async (c) => {
		const { organizationId } = c.get("opdsUser");
		const page = parsePage(c);
		const { authors, hasMore } = await listAuthors(organizationId, page);

		const entries = authors.map((a) => ({
			title: a.name,
			href: `/opds/authors/${a.id}`,
			id: `urn:nanahoshi:author:${a.id}`,
			content: `${a.bookCount} book${a.bookCount !== 1 ? "s" : ""}`,
		}));

		const feed = buildNavigationFeed(entries, {
			id: "urn:nanahoshi:authors",
			title: "Authors",
			selfHref: `/opds/authors?page=${page}`,
			nextHref: hasMore ? `/opds/authors?page=${page + 1}` : undefined,
			searchHref: "/opds/opensearch.xml",
		});
		return xmlResponse(c, feed);
	});

	// Books by author
	app.get("/authors/:id", async (c) => {
		const { organizationId } = c.get("opdsUser");
		const authorId = Number(c.req.param("id"));
		if (!Number.isFinite(authorId)) return c.text("Invalid author ID", 400);
		const page = parsePage(c);

		const { books, hasMore, authorName } = await listBooksByAuthor(
			authorId,
			organizationId,
			page,
		);

		const feed = buildAcquisitionFeed(books, {
			id: `urn:nanahoshi:author:${authorId}`,
			title: authorName ?? "Unknown Author",
			selfHref: `/opds/authors/${authorId}?page=${page}`,
			nextHref: hasMore
				? `/opds/authors/${authorId}?page=${page + 1}`
				: undefined,
			searchHref: "/opds/opensearch.xml",
		});
		return xmlResponse(c, feed);
	});

	// Series list
	app.get("/series", async (c) => {
		const { organizationId } = c.get("opdsUser");
		const page = parsePage(c);
		const { series: seriesList, hasMore } = await listSeries(
			organizationId,
			page,
		);

		const entries = seriesList.map((s) => ({
			title: s.name,
			href: `/opds/series/${s.id}`,
			id: `urn:nanahoshi:series:${s.id}`,
			content: `${s.bookCount} book${s.bookCount !== 1 ? "s" : ""}`,
		}));

		const feed = buildNavigationFeed(entries, {
			id: "urn:nanahoshi:series",
			title: "Series",
			selfHref: `/opds/series?page=${page}`,
			nextHref: hasMore ? `/opds/series?page=${page + 1}` : undefined,
			searchHref: "/opds/opensearch.xml",
		});
		return xmlResponse(c, feed);
	});

	// Books by series
	app.get("/series/:id", async (c) => {
		const { organizationId } = c.get("opdsUser");
		const seriesId = Number(c.req.param("id"));
		if (!Number.isFinite(seriesId)) return c.text("Invalid series ID", 400);
		const page = parsePage(c);

		const { books, hasMore, seriesName } = await listBooksBySeries(
			seriesId,
			organizationId,
			page,
		);

		const feed = buildAcquisitionFeed(books, {
			id: `urn:nanahoshi:series:${seriesId}`,
			title: seriesName ?? "Unknown Series",
			selfHref: `/opds/series/${seriesId}?page=${page}`,
			nextHref: hasMore
				? `/opds/series/${seriesId}?page=${page + 1}`
				: undefined,
			searchHref: "/opds/opensearch.xml",
		});
		return xmlResponse(c, feed);
	});

	// Search
	app.get("/search", async (c) => {
		const { organizationId } = c.get("opdsUser");
		const query = c.req.query("q") ?? "";
		if (!query.trim()) {
			const feed = buildAcquisitionFeed([], {
				id: "urn:nanahoshi:search",
				title: "Search Results",
				selfHref: "/opds/search",
				searchHref: "/opds/opensearch.xml",
			});
			return xmlResponse(c, feed);
		}

		const page = parsePage(c);

		// On page 1, also search for matching authors and series
		const empty: { id: number; name: string; bookCount: number }[] = [];
		const [booksResult, authors, seriesList] = await Promise.all([
			searchBooks(query, organizationId, page),
			page === 1
				? searchAuthors(query, organizationId).catch(() => empty)
				: empty,
			page === 1
				? searchSeries(query, organizationId).catch(() => empty)
				: empty,
		]);

		const navEntries = [
			...authors.map((a) => ({
				title: a.name,
				href: `/opds/authors/${a.id}`,
				id: `urn:nanahoshi:author:${a.id}`,
				content: `Author — ${a.bookCount} book${a.bookCount !== 1 ? "s" : ""}`,
			})),
			...seriesList.map((s) => ({
				title: s.name,
				href: `/opds/series/${s.id}`,
				id: `urn:nanahoshi:series:${s.id}`,
				content: `Series — ${s.bookCount} book${s.bookCount !== 1 ? "s" : ""}`,
			})),
		];

		const meta = {
			id: `urn:nanahoshi:search:${encodeURIComponent(query)}`,
			title: `Search: ${query}`,
			selfHref: `/opds/search?q=${encodeURIComponent(query)}&page=${page}`,
			nextHref: booksResult.hasMore
				? `/opds/search?q=${encodeURIComponent(query)}&page=${page + 1}`
				: undefined,
			searchHref: "/opds/opensearch.xml",
		};

		const feed =
			navEntries.length > 0
				? buildSearchFeed(navEntries, booksResult.books, meta)
				: buildAcquisitionFeed(booksResult.books, meta);

		return xmlResponse(c, feed);
	});

	return app;
}
