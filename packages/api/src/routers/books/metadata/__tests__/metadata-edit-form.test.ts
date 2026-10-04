import { expect, test } from "bun:test";
import {
	AUDIOBOOK_METADATA_FIELDS,
	audiobookMetadataValues,
	BOOK_METADATA_FIELDS,
	bookMetadataValues,
	buildAudiobookMetadataUpdate,
	buildBookMetadataUpdate,
	dirtyKeys,
	dirtyLockKeys,
	type EditableAudiobook,
	type EditableBook,
	lockStateFor,
	unlockFieldsToSend,
} from "../metadata-edit-form";

const book: EditableBook = {
	uuid: "b1",
	title: "Old title",
	titleRomaji: null,
	subtitle: null,
	description: "Desc",
	publishedDate: "2020-05-01T00:00:00.000Z",
	languageCode: "ja",
	pageCount: 300,
	isbn10: null,
	isbn13: null,
	asin: null,
	authors: [
		{ name: "Ann", role: "author" },
		{ name: "Illus", role: "illustrator" },
	],
	publisher: { name: "Pub" },
	series: { name: "Saga", position: 2 },
	genres: [{ name: "Fantasy" }],
	tags: [],
	lockedFields: ["description"],
};

const audiobook: EditableAudiobook = {
	uuid: "a1",
	title: "Audio",
	subtitle: null,
	description: null,
	publishedDate: null,
	languageCode: null,
	isbn: null,
	asin: null,
	authors: [{ name: "Ann", role: null }],
	narrators: [{ name: "Nora" }],
	publisherName: null,
	series: { name: "Saga", position: 1, sequence: "1" },
	genres: [],
	tags: [],
};

test("an untouched form sends nothing but the unlocks", () => {
	const update = buildBookMetadataUpdate(book, bookMetadataValues(book), [
		"description",
	]);
	expect(update).toEqual({
		uuid: "b1",
		metadata: {},
		unlockFields: ["description"],
	});
});

test("only edited fields are sent, cleared ones as null", () => {
	const values = {
		...bookMetadataValues(book),
		title: "  New title ",
		description: "",
		pageCount: "0",
	};
	expect(buildBookMetadataUpdate(book, values, []).metadata).toEqual({
		title: "New title",
		description: null,
		pageCount: null,
	});
});

test("authors keep their roles when the list is reordered or extended", () => {
	const values = { ...bookMetadataValues(book), authors: "Illus, Ann, New" };
	expect(buildBookMetadataUpdate(book, values, []).metadata.authors).toEqual([
		{ name: "Illus", role: "illustrator" },
		{ name: "Ann", role: "author" },
		{ name: "New", role: null },
	]);
});

test("series name and position travel together; an empty name clears it", () => {
	const moved = { ...bookMetadataValues(book), seriesPosition: "3.5" };
	expect(buildBookMetadataUpdate(book, moved, []).metadata.series).toEqual({
		name: "Saga",
		position: 3.5,
	});
	const cleared = { ...bookMetadataValues(book), seriesName: " " };
	expect(buildBookMetadataUpdate(book, cleared, []).metadata.series).toBeNull();
});

test("an audiobook's new position drops the old sequence label", () => {
	const values = {
		...audiobookMetadataValues(audiobook),
		seriesPosition: "２",
		narrators: "Nora, Ned",
	};
	expect(buildAudiobookMetadataUpdate(audiobook, values, []).metadata).toEqual({
		narrators: [{ name: "Nora" }, { name: "Ned" }],
		series: { name: "Saga", position: 2, sequence: null },
	});
});

test("locks: an edit locks, a pending unlock loses to an edit of the same lock", () => {
	const initial = bookMetadataValues(book);
	const values = { ...initial, seriesPosition: "9", description: "x" };
	const dirty = dirtyKeys(BOOK_METADATA_FIELDS, values, initial);
	const locks = dirtyLockKeys(BOOK_METADATA_FIELDS, dirty);
	expect([...locks].sort()).toEqual(["description", "series"]);
	const locked = new Set(book.lockedFields);
	const pending = new Set(["description", "genres"]);
	expect(lockStateFor("description", locked, pending, locks)).toBe(
		"pending-unlock",
	);
	expect(lockStateFor("series", locked, pending, locks)).toBe("will-lock");
	expect(lockStateFor("title", locked, pending, locks)).toBeNull();
	expect(unlockFieldsToSend(pending, locks)).toEqual(["genres"]);
});

test("every field has a label and a lock", () => {
	for (const def of [...BOOK_METADATA_FIELDS, ...AUDIOBOOK_METADATA_FIELDS]) {
		expect(def.label ?? def.labelKey).toBeTruthy();
		expect(def.lockKey).toBeTruthy();
	}
});
