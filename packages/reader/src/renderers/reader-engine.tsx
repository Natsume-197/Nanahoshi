import { lazy, type ReactNode, type RefObject, Suspense } from "react";
import type { LazyHtmlBook } from "../document/lazy-html-book";
import type { PdfReaderSource } from "../document/pdf-source";
import type {
	ReaderBookData,
	ReaderPosition,
	SectionWithProgress,
} from "../document/types";
import type { ReaderPresentation } from "../presentation/reader-presentation";
import type { ReaderSettings, ReaderTheme } from "../presentation/settings";
import type { VisualReaderSettings } from "../presentation/visual-settings";
import type { BookReaderApi } from "../reader-contract";
import { useTextReaderDocument } from "../session/use-text-reader-document";
import { ReaderLoadingOverlay } from "../ui/chrome/reader-loading-overlay";
import { BookReaderContinuous } from "./continuous/book-reader-continuous";
import { BookReaderFocus } from "./focus/book-reader-focus";
import { BookReaderPaginated } from "./paginated/book-reader-paginated";
import { BookReaderVisual } from "./visual/book-reader-visual";

const BookReaderPdf = lazy(() =>
	import("./pdf/book-reader-pdf").then((module) => ({
		default: module.BookReaderPdf,
	})),
);

interface ReaderEngineProps {
	bookUuid: string;
	presentation: ReaderPresentation;
	book: Pick<ReaderBookData, "language" | "presentation" | "sections">;
	htmlContent: string;
	theme: ReaderTheme;
	readerSettings: ReaderSettings;
	visualSettings: VisualReaderSettings;
	initialPosition: ReaderPosition | undefined;
	onPositionChange: (position: ReaderPosition) => void;
	onSectionProgressChange: (progress: Map<string, SectionWithProgress>) => void;
	onToggleChrome: () => void;
	onPdfExit: () => void;
	onPdfCompleteBook: () => void;
	onPdfFullscreen: () => void;
	onPdfOpenSettings: () => void;
	onExitFocus: () => void;
	navigationBlocked: boolean;
	reservePlayerSpace: boolean;
	scrollContainerRef: RefObject<HTMLElement | null>;
	controllerRef: (controller: BookReaderApi | null) => void;
	pdfSource?: PdfReaderSource;
	/** PDFs draw the shared header themselves, inside the viewer's context. */
	pdfHeader?: { bookTitle: string; sessionControl: ReactNode };
	lazyBook?: LazyHtmlBook;
	onPdfDocumentReady?: (pageCount: number) => void;
}

/**
 * Deep seam over the three reader engines. Callers provide normalized book
 * data and preferences; renderer-specific props and unsupported details remain
 * internal to this module.
 */
export function ReaderEngine({
	bookUuid,
	presentation,
	book,
	htmlContent,
	theme,
	readerSettings,
	visualSettings,
	initialPosition,
	onPositionChange,
	onSectionProgressChange,
	onToggleChrome,
	onPdfExit,
	onPdfCompleteBook,
	onPdfFullscreen,
	onPdfOpenSettings,
	onExitFocus,
	navigationBlocked,
	reservePlayerSpace,
	scrollContainerRef,
	controllerRef,
	pdfSource,
	pdfHeader,
	lazyBook,
	onPdfDocumentReady,
}: ReaderEngineProps) {
	const textDocument = useTextReaderDocument({
		enabled: presentation.renderer === "text-focus",
		bookUuid,
		htmlContent,
		language: book.language,
		sections: book.sections,
	});

	if (presentation.renderer === "pdf") {
		if (!pdfSource) return null;
		return (
			<Suspense fallback={<ReaderLoadingOverlay theme={theme} />}>
				<BookReaderPdf
					bookUuid={bookUuid}
					source={pdfSource}
					bookTitle={pdfHeader?.bookTitle ?? pdfSource.name}
					sessionControl={pdfHeader?.sessionControl}
					theme={theme}
					sections={book.sections}
					initialPosition={initialPosition}
					onPositionChange={onPositionChange}
					onSectionProgressChange={onSectionProgressChange}
					onExit={onPdfExit}
					onCompleteBook={onPdfCompleteBook}
					onFullscreen={onPdfFullscreen}
					onOpenSettings={onPdfOpenSettings}
					apiRef={controllerRef}
					onDocumentReady={onPdfDocumentReady}
				/>
			</Suspense>
		);
	}
	if (presentation.renderer === "visual") {
		return (
			<BookReaderVisual
				htmlContent={htmlContent}
				theme={theme}
				layout={presentation.visualLayout}
				language={book.language}
				pageProgressionDirection={book.presentation?.pageProgressionDirection}
				readingDirection={visualSettings.readingDirection}
				sections={book.sections}
				initialPosition={initialPosition}
				onPositionChange={onPositionChange}
				onSectionProgressChange={onSectionProgressChange}
				onToggleChrome={onToggleChrome}
				apiRef={controllerRef}
			/>
		);
	}

	const verticalMode = readerSettings.writingMode === "vertical-rl";
	const sharedProps = {
		htmlContent,
		language: book.language,
		verticalMode,
		theme,
		fontFamilyGroupOne: readerSettings.fontFamilyGroupOne,
		fontFamilyGroupTwo: readerSettings.fontFamilyGroupTwo,
		fontWeight: readerSettings.fontWeight,
		fontSize: readerSettings.fontSize,
		lineHeight: readerSettings.lineHeight,
		textIndentation: readerSettings.textIndentation,
		textMarginMode: readerSettings.textMarginMode,
		textMarginValue: readerSettings.textMarginValue,
		verticalTextOrientation: readerSettings.verticalTextOrientation,
		enableFontKerning: readerSettings.enableFontKerning,
		enableFontVPAL: readerSettings.enableFontVPAL,
		prioritizeReaderStyles: readerSettings.prioritizeReaderStyles,
		enableTextJustification: readerSettings.enableTextJustification,
		enableTextWrapPretty: readerSettings.enableTextWrapPretty,
		secondDimensionMaxValue: readerSettings.secondDimensionMaxValue,
		firstDimensionMargin: readerSettings.firstDimensionMargin,
		hideFurigana: readerSettings.hideFurigana,
		furiganaStyle: readerSettings.furiganaStyle,
		disableWheelNavigation: readerSettings.disableWheelNavigation,
		navigationBlocked,
		sections: book.sections,
		initialPosition,
		onPositionChange,
		onSectionProgressChange,
		apiRef: controllerRef,
	};

	if (presentation.renderer === "text-paginated") {
		return (
			<BookReaderPaginated
				{...sharedProps}
				lazyBook={lazyBook}
				avoidPageBreak={readerSettings.avoidPageBreak}
				pageColumns={readerSettings.pageColumns}
				reservePlayerSpace={reservePlayerSpace}
			/>
		);
	}
	if (presentation.renderer === "text-focus") {
		return (
			<BookReaderFocus
				{...sharedProps}
				focusDocument={textDocument.document}
				preparationError={textDocument.error}
				textSpeed={readerSettings.focusTextSpeed}
				sentenceIndicator={readerSettings.focusSentenceIndicator}
				onExitFocus={onExitFocus}
			/>
		);
	}

	const continuousProps = {
		...sharedProps,
		autoPositionOnResize: readerSettings.autoPositionOnResize,
		reservePlayerSpace,
		scrollContainerRef,
	};
	return <BookReaderContinuous {...continuousProps} />;
}
