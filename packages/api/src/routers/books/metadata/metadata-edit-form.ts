import type {
	LockableAudiobookField,
	ManualAudiobookMetadata,
} from "../../audiobooks/metadata/audiobook-metadata.model";
import type {
	LockableBookField,
	ManualBookMetadata,
} from "./book.metadata.model";

// The manual "Edit metadata" form, shared by the web dialog and the phone
// sheet: which fields it shows, how a title fills them, and the update the
// edited values send. Type-only imports keep it free of server code.

export type MetadataFieldKind =
	| "text"
	| "textarea"
	| "date"
	| "number"
	| "list";

export type MetadataFieldDef = {
	key: string;
	/** Server-side lock name; series name/position share the "series" lock. */
	lockKey: string;
	/** Message key in the web catalog; `label` overrides it (ISBN, ASIN). */
	labelKey: string;
	label?: string;
	kind: MetadataFieldKind;
	mono?: boolean;
	listHint?: boolean;
	fullWidth?: boolean;
};

export type MetadataValues = Record<string, string>;

export type MetadataLockState =
	| "locked"
	| "pending-unlock"
	| "will-lock"
	| null;

type Named = { name: string };
type Author = { name: string; role?: string | null };

export function splitList(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function joinNames(items: Named[] | null | undefined): string {
	return (items ?? []).map((i) => i.name).join(", ");
}

function textOrNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

/** The fields whose value differs from where the form started. */
export function dirtyKeys(
	fields: MetadataFieldDef[],
	values: MetadataValues,
	initial: MetadataValues,
): Set<string> {
	return new Set(
		fields
			.filter((f) => (values[f.key] ?? "") !== (initial[f.key] ?? ""))
			.map((f) => f.key),
	);
}

/** Locks touched by an edit: each one is (re)locked on save. */
export function dirtyLockKeys(
	fields: MetadataFieldDef[],
	dirty: Set<string>,
): Set<string> {
	return new Set(fields.filter((f) => dirty.has(f.key)).map((f) => f.lockKey));
}

export function lockStateFor(
	lockKey: string,
	locked: ReadonlySet<string>,
	pendingUnlocks: ReadonlySet<string>,
	dirtyLocks: ReadonlySet<string>,
): MetadataLockState {
	if (locked.has(lockKey)) {
		return pendingUnlocks.has(lockKey) ? "pending-unlock" : "locked";
	}
	return dirtyLocks.has(lockKey) ? "will-lock" : null;
}

/** A field edited in the same save wins over its pending unlock. */
export function unlockFieldsToSend(
	pendingUnlocks: ReadonlySet<string>,
	dirtyLocks: ReadonlySet<string>,
): string[] {
	return [...pendingUnlocks].filter((key) => !dirtyLocks.has(key));
}

// ─── Books ────────────────────────────────────────────────

export const BOOK_METADATA_FIELDS: MetadataFieldDef[] = [
	{
		key: "title",
		lockKey: "title",
		labelKey: "book.meta_title",
		kind: "text",
		fullWidth: true,
	},
	{
		key: "titleRomaji",
		lockKey: "titleRomaji",
		labelKey: "metadata.title_romaji",
		kind: "text",
	},
	{
		key: "subtitle",
		lockKey: "subtitle",
		labelKey: "book.meta_subtitle",
		kind: "text",
	},
	{
		key: "authors",
		lockKey: "authors",
		labelKey: "book.authors",
		kind: "list",
		listHint: true,
		fullWidth: true,
	},
	{
		key: "description",
		lockKey: "description",
		labelKey: "book.meta_description",
		kind: "textarea",
		fullWidth: true,
	},
	{
		key: "publisher",
		lockKey: "publisher",
		labelKey: "book.publisher",
		kind: "text",
	},
	{
		key: "languageCode",
		lockKey: "languageCode",
		labelKey: "book.language",
		kind: "text",
	},
	{
		key: "seriesName",
		lockKey: "series",
		labelKey: "book.series",
		kind: "text",
	},
	{
		key: "seriesPosition",
		lockKey: "series",
		labelKey: "book.series_position",
		kind: "number",
	},
	{
		key: "publishedDate",
		lockKey: "publishedDate",
		labelKey: "book.meta_published_date",
		kind: "date",
	},
	{
		key: "pageCount",
		lockKey: "pageCount",
		labelKey: "book.meta_page_count",
		kind: "number",
	},
	{
		key: "isbn10",
		lockKey: "isbn10",
		labelKey: "",
		label: "ISBN-10",
		kind: "text",
		mono: true,
	},
	{
		key: "isbn13",
		lockKey: "isbn13",
		labelKey: "",
		label: "ISBN-13",
		kind: "text",
		mono: true,
	},
	{
		key: "asin",
		lockKey: "asin",
		labelKey: "",
		label: "ASIN",
		kind: "text",
		mono: true,
	},
	{
		key: "genres",
		lockKey: "genres",
		labelKey: "book.genres",
		kind: "list",
		listHint: true,
		fullWidth: true,
	},
	{
		key: "tags",
		lockKey: "tags",
		labelKey: "book.tags",
		kind: "list",
		listHint: true,
		fullWidth: true,
	},
];

export type EditableBook = {
	uuid: string;
	title: string | null;
	titleRomaji: string | null;
	subtitle: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	pageCount: number | null;
	isbn10: string | null;
	isbn13: string | null;
	asin: string | null;
	authors: Author[];
	publisher: Named | null;
	series: { name: string; position: number | null } | null;
	genres: Named[];
	tags: Named[];
	lockedFields?: string[] | null;
};

export function bookMetadataValues(book: EditableBook): MetadataValues {
	return {
		title: book.title ?? "",
		titleRomaji: book.titleRomaji ?? "",
		subtitle: book.subtitle ?? "",
		authors: joinNames(book.authors),
		description: book.description ?? "",
		publisher: book.publisher?.name ?? "",
		languageCode: book.languageCode ?? "",
		seriesName: book.series?.name ?? "",
		seriesPosition:
			book.series?.position != null ? String(book.series.position) : "",
		publishedDate: book.publishedDate?.slice(0, 10) ?? "",
		pageCount: book.pageCount != null ? String(book.pageCount) : "",
		isbn10: book.isbn10 ?? "",
		isbn13: book.isbn13 ?? "",
		asin: book.asin ?? "",
		genres: joinNames(book.genres),
		tags: joinNames(book.tags),
	};
}

/** Only edited fields are sent: every key present is saved and locked. */
export function buildBookMetadataUpdate(
	book: EditableBook,
	values: MetadataValues,
	unlockFields: string[],
) {
	const v = (key: string) => values[key] ?? "";
	const dirty = dirtyKeys(
		BOOK_METADATA_FIELDS,
		values,
		bookMetadataValues(book),
	);
	const metadata: ManualBookMetadata = {};
	if (dirty.has("title")) metadata.title = textOrNull(v("title"));
	if (dirty.has("titleRomaji"))
		metadata.titleRomaji = textOrNull(v("titleRomaji"));
	if (dirty.has("subtitle")) metadata.subtitle = textOrNull(v("subtitle"));
	if (dirty.has("description"))
		metadata.description = textOrNull(v("description"));
	if (dirty.has("publisher")) metadata.publisher = textOrNull(v("publisher"));
	if (dirty.has("languageCode"))
		metadata.languageCode = textOrNull(v("languageCode"));
	if (dirty.has("publishedDate"))
		metadata.publishedDate = textOrNull(v("publishedDate"));
	if (dirty.has("pageCount")) {
		const n = Number.parseInt(v("pageCount"), 10);
		metadata.pageCount = Number.isFinite(n) && n > 0 ? n : null;
	}
	if (dirty.has("isbn10")) metadata.isbn10 = textOrNull(v("isbn10"));
	if (dirty.has("isbn13")) metadata.isbn13 = textOrNull(v("isbn13"));
	if (dirty.has("asin")) metadata.asin = textOrNull(v("asin"));
	if (dirty.has("authors")) {
		// Existing roles survive a reordered/extended author list.
		const roleByName = new Map(
			book.authors.map((a) => [a.name, a.role ?? null]),
		);
		metadata.authors = splitList(v("authors")).map((name) => ({
			name,
			role: roleByName.get(name) ?? null,
		}));
	}
	if (dirty.has("seriesName") || dirty.has("seriesPosition")) {
		const name = v("seriesName").trim();
		const position = Number.parseFloat(v("seriesPosition"));
		metadata.series = name
			? { name, position: Number.isFinite(position) ? position : null }
			: null;
	}
	if (dirty.has("genres")) metadata.genres = splitList(v("genres"));
	if (dirty.has("tags")) metadata.tags = splitList(v("tags"));
	return {
		uuid: book.uuid,
		metadata,
		unlockFields: unlockFields as LockableBookField[],
	};
}

// ─── Audiobooks ───────────────────────────────────────────

export const AUDIOBOOK_METADATA_FIELDS: MetadataFieldDef[] = [
	{
		key: "title",
		lockKey: "title",
		labelKey: "book.meta_title",
		kind: "text",
		fullWidth: true,
	},
	{
		key: "subtitle",
		lockKey: "subtitle",
		labelKey: "book.meta_subtitle",
		kind: "text",
		fullWidth: true,
	},
	{
		key: "authors",
		lockKey: "authors",
		labelKey: "audiobook.authors",
		kind: "list",
		listHint: true,
		fullWidth: true,
	},
	{
		key: "narrators",
		lockKey: "narrators",
		labelKey: "audiobook.narrators",
		kind: "list",
		listHint: true,
		fullWidth: true,
	},
	{
		key: "description",
		lockKey: "description",
		labelKey: "book.meta_description",
		kind: "textarea",
		fullWidth: true,
	},
	{
		key: "publisher",
		lockKey: "publisher",
		labelKey: "book.publisher",
		kind: "text",
	},
	{
		key: "languageCode",
		lockKey: "languageCode",
		labelKey: "audiobook.language",
		kind: "text",
	},
	{
		key: "seriesName",
		lockKey: "series",
		labelKey: "audiobook.series",
		kind: "text",
	},
	{
		key: "seriesPosition",
		lockKey: "series",
		labelKey: "audiobook.series_position",
		kind: "number",
	},
	{
		key: "seriesSequence",
		lockKey: "series",
		labelKey: "audiobook.series_sequence",
		kind: "text",
	},
	{
		key: "publishedDate",
		lockKey: "publishedDate",
		labelKey: "book.meta_published_date",
		kind: "date",
	},
	{
		key: "isbn",
		lockKey: "isbn",
		labelKey: "",
		label: "ISBN",
		kind: "text",
		mono: true,
	},
	{
		key: "asin",
		lockKey: "asin",
		labelKey: "",
		label: "ASIN",
		kind: "text",
		mono: true,
	},
	{
		key: "genres",
		lockKey: "genres",
		labelKey: "book.genres",
		kind: "list",
		listHint: true,
		fullWidth: true,
	},
	{
		key: "tags",
		lockKey: "tags",
		labelKey: "book.tags",
		kind: "list",
		listHint: true,
		fullWidth: true,
	},
];

export type EditableAudiobook = {
	uuid: string;
	title: string | null;
	subtitle: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	isbn: string | null;
	asin: string | null;
	authors: Author[];
	narrators: Named[];
	publisherName: string | null;
	series: {
		name: string;
		position: number | null;
		sequence?: string | null;
	} | null;
	genres: Named[];
	tags: Named[];
	lockedFields?: string[] | null;
};

export function audiobookMetadataValues(
	audiobook: EditableAudiobook,
): MetadataValues {
	return {
		title: audiobook.title ?? "",
		subtitle: audiobook.subtitle ?? "",
		authors: joinNames(audiobook.authors),
		narrators: joinNames(audiobook.narrators),
		description: audiobook.description ?? "",
		publisher: audiobook.publisherName ?? "",
		languageCode: audiobook.languageCode ?? "",
		seriesName: audiobook.series?.name ?? "",
		seriesSequence: audiobook.series?.sequence ?? "",
		seriesPosition:
			audiobook.series?.position != null
				? String(audiobook.series.position)
				: "",
		publishedDate: audiobook.publishedDate?.slice(0, 10) ?? "",
		isbn: audiobook.isbn ?? "",
		asin: audiobook.asin ?? "",
		genres: joinNames(audiobook.genres),
		tags: joinNames(audiobook.tags),
	};
}

export function buildAudiobookMetadataUpdate(
	audiobook: EditableAudiobook,
	values: MetadataValues,
	unlockFields: string[],
) {
	const v = (key: string) => values[key] ?? "";
	const dirty = dirtyKeys(
		AUDIOBOOK_METADATA_FIELDS,
		values,
		audiobookMetadataValues(audiobook),
	);
	const metadata: ManualAudiobookMetadata = {};
	if (dirty.has("title")) metadata.title = textOrNull(v("title"));
	if (dirty.has("subtitle")) metadata.subtitle = textOrNull(v("subtitle"));
	if (dirty.has("description"))
		metadata.description = textOrNull(v("description"));
	if (dirty.has("publisher")) metadata.publisher = textOrNull(v("publisher"));
	if (dirty.has("languageCode"))
		metadata.languageCode = textOrNull(v("languageCode"));
	if (dirty.has("publishedDate"))
		metadata.publishedDate = textOrNull(v("publishedDate"));
	if (dirty.has("isbn")) metadata.isbn = textOrNull(v("isbn"));
	if (dirty.has("asin")) metadata.asin = textOrNull(v("asin"));
	if (dirty.has("authors")) {
		const roleByName = new Map(
			audiobook.authors.map((a) => [a.name, a.role ?? null]),
		);
		metadata.authors = splitList(v("authors")).map((name) => ({
			name,
			role: roleByName.get(name) ?? null,
		}));
	}
	if (dirty.has("narrators")) {
		metadata.narrators = splitList(v("narrators")).map((name) => ({
			name,
		}));
	}
	if (
		dirty.has("seriesName") ||
		dirty.has("seriesPosition") ||
		dirty.has("seriesSequence")
	) {
		const name = v("seriesName").trim();
		const position = v("seriesPosition").trim()
			? Number(v("seriesPosition").normalize("NFKC"))
			: Number.NaN;
		metadata.series = name
			? {
					name,
					position: Number.isFinite(position) ? position : null,
					sequence:
						dirty.has("seriesPosition") && !dirty.has("seriesSequence")
							? null
							: textOrNull(v("seriesSequence")),
				}
			: null;
	}
	if (dirty.has("genres")) metadata.genres = splitList(v("genres"));
	if (dirty.has("tags")) metadata.tags = splitList(v("tags"));
	return {
		uuid: audiobook.uuid,
		metadata,
		unlockFields: unlockFields as LockableAudiobookField[],
	};
}
