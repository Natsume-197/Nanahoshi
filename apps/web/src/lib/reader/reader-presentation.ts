import type { ComicLayout } from "./manga-settings";
import type { TextLayout } from "./settings";
import type { ReaderBookData } from "./types";

export type ReadAs = "auto" | "text" | "comic";
export type ReaderEngineKind = "text-scroll" | "text-paginated" | "comic";

export type ReaderPresentationPreference =
	| { readAs: "auto" }
	| { readAs: "text"; textLayout: TextLayout }
	| { readAs: "comic" };

export type ReaderPresentationChange =
	| { type: "read-as"; value: ReadAs }
	| { type: "text-layout"; value: TextLayout };

export interface ReaderPresentation {
	readAs: ReadAs;
	resolvedAs: Exclude<ReadAs, "auto">;
	textLayout: TextLayout;
	comicLayout: ComicLayout;
	engine: ReaderEngineKind;
	supportsComic: boolean;
}

const PRESENTATION_PREFERENCES_KEY = "nanahoshi-reader-mode-preferences";

function isLegacyComicArchive(book: ReaderBookData) {
	return (
		book.sourceFormat === "cbz" ||
		book.sourceFormat === "cbr" ||
		book.sourceFormat === "cb7"
	);
}

function supportsComicPresentation(book: ReaderBookData) {
	return book.contentForm === "images" || isLegacyComicArchive(book);
}

export function resolveReaderPresentation({
	book,
	preference,
	defaultTextLayout,
	comicLayout,
}: {
	book?: ReaderBookData | null;
	preference: ReaderPresentationPreference;
	defaultTextLayout: TextLayout;
	comicLayout: ComicLayout;
}): ReaderPresentation {
	const supportsComic = book ? supportsComicPresentation(book) : false;
	const unsupportedComic = preference.readAs === "comic" && !supportsComic;
	const readAs = unsupportedComic ? "auto" : preference.readAs;
	const resolvedAs =
		readAs === "comic" || (readAs === "auto" && supportsComic)
			? "comic"
			: "text";
	const textLayout =
		preference.readAs === "text" ? preference.textLayout : defaultTextLayout;

	return {
		readAs,
		resolvedAs,
		textLayout,
		comicLayout,
		engine:
			resolvedAs === "comic"
				? "comic"
				: textLayout === "paginated"
					? "text-paginated"
					: "text-scroll",
		supportsComic,
	};
}

export function updateReaderPresentationPreference(
	current: ReaderPresentation,
	change: ReaderPresentationChange,
): ReaderPresentationPreference {
	if (change.type === "text-layout") {
		return { readAs: "text", textLayout: change.value };
	}
	if (change.value === "auto") return { readAs: "auto" };
	if (change.value === "comic") return { readAs: "comic" };
	return { readAs: "text", textLayout: current.textLayout };
}

function normalizePreference(value: unknown): ReaderPresentationPreference {
	if (value === "continuous") return { readAs: "text", textLayout: "scroll" };
	if (value === "paginated") return { readAs: "text", textLayout: "paginated" };
	if (value === "visual") return { readAs: "comic" };
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { readAs: "auto" };
	}
	const stored = value as { readAs?: unknown; textLayout?: unknown };
	if (stored.readAs === "comic") return { readAs: "comic" };
	if (stored.readAs === "text") {
		return {
			readAs: "text",
			textLayout: stored.textLayout === "paginated" ? "paginated" : "scroll",
		};
	}
	return { readAs: "auto" };
}

function loadStoredPreferences(): Record<string, ReaderPresentationPreference> {
	if (typeof window === "undefined") return {};
	try {
		const parsed = JSON.parse(
			window.localStorage.getItem(PRESENTATION_PREFERENCES_KEY) ?? "{}",
		) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}
		return Object.fromEntries(
			Object.entries(parsed).flatMap(([uuid, value]) => {
				const preference = normalizePreference(value);
				return preference.readAs === "auto" ? [] : [[uuid, preference]];
			}),
		);
	} catch {
		return {};
	}
}

export function loadReaderPresentationPreference(
	bookUuid: string,
): ReaderPresentationPreference {
	return loadStoredPreferences()[bookUuid] ?? { readAs: "auto" };
}

export function saveReaderPresentationPreference(
	bookUuid: string,
	preference: ReaderPresentationPreference,
) {
	if (typeof window === "undefined") return;
	try {
		const stored = loadStoredPreferences();
		if (preference.readAs === "auto") delete stored[bookUuid];
		else stored[bookUuid] = preference;
		if (Object.keys(stored).length === 0) {
			window.localStorage.removeItem(PRESENTATION_PREFERENCES_KEY);
		} else {
			window.localStorage.setItem(
				PRESENTATION_PREFERENCES_KEY,
				JSON.stringify(stored),
			);
		}
	} catch {
		// Private storage may reject writes; the live preference still works.
	}
}
