import { generateSignedPath } from "../files/helpers/urlSigner";

const ATOM_NS = "http://www.w3.org/2005/Atom";
const OPDS_NS = "http://opds-spec.org/2010/catalog";
const OPENSEARCH_NS = "http://a9.com/-/spec/opensearch/1.1/";
const DC_NS = "http://purl.org/dc/terms/";

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function formatDate(date?: string | Date | null): string {
	if (!date) return new Date().toISOString();
	return new Date(date).toISOString();
}

const MEDIA_TYPE_MAP: Record<string, string> = {
	epub: "application/epub+zip",
	pdf: "application/pdf",
	mobi: "application/x-mobipocket-ebook",
	azw3: "application/x-mobi8-ebook",
	cbz: "application/x-cbz",
	cbr: "application/x-cbr",
	fb2: "application/x-fictionbook+xml",
};

function getMediaType(filename: string): string {
	const ext = filename.split(".").pop()?.toLowerCase() ?? "";
	return MEDIA_TYPE_MAP[ext] ?? "application/octet-stream";
}

export interface OpdsFeedMeta {
	id: string;
	title: string;
	selfHref: string;
	nextHref?: string;
	searchHref?: string;
}

interface NavigationEntry {
	title: string;
	href: string;
	id: string;
	content?: string;
}

export interface OpdsBookEntry {
	uuid: string;
	title: string;
	filename: string;
	authors: { id: number; name: string }[];
	description?: string | null;
	cover?: string | null;
	languageCode?: string | null;
	publisherName?: string | null;
	isbn13?: string | null;
	isbn10?: string | null;
	publishedDate?: string | null;
	filesizeKb?: number | null;
	createdAt: string;
	seriesName?: string | null;
	seriesPosition?: number | null;
}

function buildBookEntry(book: OpdsBookEntry): string {
	const mediaType = getMediaType(book.filename);
	const downloadPath = generateSignedPath(book.uuid, 86400);
	const coverFilename = book.cover?.replace(/^data\/covers\//, "") ?? null;
	const coverUrl = coverFilename
		? `/api/data/covers/${escapeXml(coverFilename)}?width=600&format=jpeg`
		: null;

	const authorXml = book.authors
		.map(
			(a) => `    <author>
      <name>${escapeXml(a.name)}</name>
      <uri>/opds/authors/${a.id}</uri>
    </author>`,
		)
		.join("\n");

	const categoryXml = book.seriesName
		? `    <category term="${escapeXml(book.seriesName)}" label="${escapeXml(book.seriesName)}"/>`
		: "";

	const dcLanguage = book.languageCode
		? `    <dcterms:language>${escapeXml(book.languageCode)}</dcterms:language>`
		: "";

	const dcPublisher = book.publisherName
		? `    <dcterms:publisher>${escapeXml(book.publisherName)}</dcterms:publisher>`
		: "";

	const dcIssued = book.publishedDate
		? `    <dcterms:issued>${escapeXml(book.publishedDate)}</dcterms:issued>`
		: "";

	const dcIdentifiers = [
		book.isbn13
			? `    <dcterms:identifier>urn:isbn:${escapeXml(book.isbn13)}</dcterms:identifier>`
			: "",
		book.isbn10
			? `    <dcterms:identifier>urn:isbn:${escapeXml(book.isbn10)}</dcterms:identifier>`
			: "",
	]
		.filter(Boolean)
		.join("\n");

	const desc =
		book.description && book.description.length > 500
			? `${book.description.slice(0, 500)}…`
			: book.description;
	const summary = desc
		? `    <summary type="html">${escapeXml(desc)}</summary>`
		: "";

	const coverLinks = coverUrl
		? `    <link rel="http://opds-spec.org/image" href="${escapeXml(coverUrl)}" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="${escapeXml(coverUrl)}" type="image/jpeg"/>`
		: "";

	const fileSizeAttr =
		book.filesizeKb != null ? ` length="${book.filesizeKb * 1024}"` : "";

	return `  <entry>
    <title>${escapeXml(book.title)}</title>
    <id>urn:uuid:${escapeXml(book.uuid)}</id>
    <updated>${formatDate(book.createdAt)}</updated>
${authorXml}
${summary}
${categoryXml}
${dcLanguage}
${dcPublisher}
${dcIssued}
${dcIdentifiers}
${coverLinks}
    <link rel="http://opds-spec.org/acquisition" href="${escapeXml(downloadPath)}" type="${mediaType}"${fileSizeAttr}/>
  </entry>`;
}

export function buildNavigationFeed(
	entries: NavigationEntry[],
	meta: OpdsFeedMeta,
): string {
	const entryXml = entries
		.map(
			(e) => `  <entry>
    <title>${escapeXml(e.title)}</title>
    <id>${escapeXml(e.id)}</id>
    <updated>${new Date().toISOString()}</updated>
    <link rel="subsection" href="${escapeXml(e.href)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    ${e.content ? `<content type="text">${escapeXml(e.content)}</content>` : ""}
  </entry>`,
		)
		.join("\n");

	const searchLink = meta.searchHref
		? `  <link rel="search" href="${escapeXml(meta.searchHref)}" type="application/opensearchdescription+xml"/>`
		: "";

	const nextLink = meta.nextHref
		? `  <link rel="next" href="${escapeXml(meta.nextHref)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>`
		: "";

	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="${ATOM_NS}" xmlns:opds="${OPDS_NS}" xmlns:dcterms="${DC_NS}">
  <id>${escapeXml(meta.id)}</id>
  <title>${escapeXml(meta.title)}</title>
  <updated>${new Date().toISOString()}</updated>
  <link rel="self" href="${escapeXml(meta.selfHref)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
${searchLink}
${nextLink}
${entryXml}
</feed>`;
}

export function buildAcquisitionFeed(
	books: OpdsBookEntry[],
	meta: OpdsFeedMeta,
	prefixXml?: string,
): string {
	const entryXml = books.map(buildBookEntry).join("\n");

	const nextLink = meta.nextHref
		? `  <link rel="next" href="${escapeXml(meta.nextHref)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>`
		: "";

	const searchLink = meta.searchHref
		? `  <link rel="search" href="${escapeXml(meta.searchHref)}" type="application/opensearchdescription+xml"/>`
		: "";

	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="${ATOM_NS}" xmlns:opds="${OPDS_NS}" xmlns:dcterms="${DC_NS}" xmlns:opensearch="${OPENSEARCH_NS}">
  <id>${escapeXml(meta.id)}</id>
  <title>${escapeXml(meta.title)}</title>
  <updated>${new Date().toISOString()}</updated>
  <link rel="self" href="${escapeXml(meta.selfHref)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
${searchLink}
${nextLink}
${prefixXml ?? ""}
${entryXml}
</feed>`;
}

export function buildSearchFeed(
	navigationEntries: (NavigationEntry & { content: string })[],
	books: OpdsBookEntry[],
	meta: OpdsFeedMeta,
): string {
	const navXml = navigationEntries
		.map(
			(e) => `  <entry>
    <title>${escapeXml(e.title)}</title>
    <id>${escapeXml(e.id)}</id>
    <updated>${new Date().toISOString()}</updated>
    <content type="text">${escapeXml(e.content)}</content>
    <link rel="subsection" href="${escapeXml(e.href)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>`,
		)
		.join("\n");

	return buildAcquisitionFeed(books, meta, navXml);
}

export function buildSearchDescription(): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Nanahoshi</ShortName>
  <Description>Search the Nanahoshi book library</Description>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition" template="/opds/search?q={searchTerms}"/>
</OpenSearchDescription>`;
}
