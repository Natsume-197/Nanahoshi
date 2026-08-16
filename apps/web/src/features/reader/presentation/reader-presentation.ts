import type { ReaderBookData } from "@/features/reader/document/types";
import type { TextLayout } from "./settings";
import type { VisualLayout } from "./visual-settings";

export type ReadAs = "auto" | "text" | "visual";
/**
 * The kind of reading material available after loading a source file.
 *
 * This intentionally describes the material, not its file extension: an EPUB
 * can resolve to either text or visual content, while a PDF keeps its own
 * fixed-page renderer.
 */
export type ReaderContentKind = "text" | "visual" | "pdf";

/** The concrete renderer selected for the current reading session. */
export type ReaderRendererKind =
	| "text-scroll"
	| "text-paginated"
	| "text-focus"
	| "visual"
	| "pdf";

export type ReaderPresentationPreference =
	| { readAs: "auto" }
	| { readAs: "text"; textLayout: TextLayout }
	| { readAs: "visual" };

export type ReaderPresentationChange =
	| { type: "read-as"; value: ReadAs }
	| { type: "text-layout"; value: TextLayout };

export interface ReaderPresentation {
	readAs: ReadAs;
	resolvedAs: Exclude<ReadAs, "auto">;
	textLayout: TextLayout;
	visualLayout: VisualLayout;
	contentKind: ReaderContentKind;
	renderer: ReaderRendererKind;
	supportsVisual: boolean;
}

/**
 * Page columns are a paginated-text layout primitive. Keeping this capability
 * alongside the resolved engine prevents a quick-setting from being offered
 * to continuous/focus readers where it cannot have an effect.
 */
export function canUsePageColumns(
	renderer: ReaderRendererKind,
	verticalMode: boolean,
) {
	return renderer === "text-paginated" && !verticalMode;
}

const PRESENTATION_PREFERENCES_KEY = "nanahoshi-reader-mode-preferences";

function isLegacyComicArchive(book: ReaderBookData) {
	return (
		book.sourceFormat === "cbz" ||
		book.sourceFormat === "cbr" ||
		book.sourceFormat === "cb7"
	);
}

function supportsVisualPresentation(book: ReaderBookData) {
	if (book.sourceFormat === "pdf") return false;
	return book.contentForm === "images" || isLegacyComicArchive(book);
}

export function resolveReaderPresentation({
	book,
	preference,
	defaultTextLayout,
	visualLayout,
}: {
	book?: ReaderBookData | null;
	preference: ReaderPresentationPreference;
	defaultTextLayout: TextLayout;
	visualLayout: VisualLayout;
}): ReaderPresentation {
	const supportsVisual = book ? supportsVisualPresentation(book) : false;
	const unsupportedVisual = preference.readAs === "visual" && !supportsVisual;
	const readAs = unsupportedVisual ? "auto" : preference.readAs;
	const resolvedAs =
		readAs === "visual" || (readAs === "auto" && supportsVisual)
			? "visual"
			: "text";
	const textLayout =
		preference.readAs === "text" ? preference.textLayout : defaultTextLayout;

	const contentKind: ReaderContentKind =
		book?.sourceFormat === "pdf"
			? "pdf"
			: resolvedAs === "visual"
				? "visual"
				: "text";
	const renderer: ReaderRendererKind =
		contentKind === "pdf"
			? "pdf"
			: contentKind === "visual"
				? "visual"
				: textLayout === "paginated"
					? "text-paginated"
					: textLayout === "focus"
						? "text-focus"
						: "text-scroll";

	return {
		readAs,
		resolvedAs,
		textLayout,
		visualLayout,
		contentKind,
		renderer,
		supportsVisual,
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
	if (change.value === "visual") return { readAs: "visual" };
	return { readAs: "text", textLayout: current.textLayout };
}

function normalizePreference(value: unknown): ReaderPresentationPreference {
	if (value === "continuous") return { readAs: "text", textLayout: "scroll" };
	if (value === "paginated") return { readAs: "text", textLayout: "paginated" };
	if (value === "focus") return { readAs: "text", textLayout: "focus" };
	if (value === "visual") return { readAs: "visual" };
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { readAs: "auto" };
	}
	const stored = value as { readAs?: unknown; textLayout?: unknown };
	// "comic" was the original persisted vocabulary. New writes use the
	// broader "visual" term, which also covers webtoons and image-first books.
	if (stored.readAs === "visual" || stored.readAs === "comic") {
		return { readAs: "visual" };
	}
	if (stored.readAs === "text") {
		return {
			readAs: "text",
			textLayout:
				stored.textLayout === "paginated" || stored.textLayout === "focus"
					? stored.textLayout
					: "scroll",
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
