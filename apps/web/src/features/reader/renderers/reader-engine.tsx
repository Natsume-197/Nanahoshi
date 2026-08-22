import type { RefObject } from "react";
import type { LazyHtmlBook } from "@/features/reader/document/lazy-html-book";
import type { PdfReaderSource } from "@/features/reader/document/pdf-source";
import type {
	ReaderBookData,
	ReaderPosition,
	SectionWithProgress,
} from "@/features/reader/document/types";
import type { ReaderPresentation } from "@/features/reader/presentation/reader-presentation";
import type {
	ReaderSettings,
	ReaderTheme,
} from "@/features/reader/presentation/settings";
import type { VisualReaderSettings } from "@/features/reader/presentation/visual-settings";
import type { BookReaderApi } from "@/features/reader/reader-contract";
import { BookReaderContinuous } from "@/features/reader/renderers/continuous/book-reader-continuous";
import { BookReaderFocus } from "@/features/reader/renderers/focus/book-reader-focus";
import { BookReaderPaginated } from "@/features/reader/renderers/paginated/book-reader-paginated";
import { BookReaderPdf } from "@/features/reader/renderers/pdf/book-reader-pdf";
import { BookReaderVisual } from "@/features/reader/renderers/visual/book-reader-visual";
import { useTextReaderDocument } from "@/features/reader/session/use-text-reader-document";

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
	lazyBook,
	onPdfDocumentReady,
}: ReaderEngineProps) {
	const textDocument = useTextReaderDocument({
		enabled: presentation.contentKind === "text",
		bookUuid,
		htmlContent,
		language: book.language,
		sections: book.sections,
	});

	if (presentation.renderer === "pdf") {
		if (!pdfSource) return null;
		return (
			<BookReaderPdf
				source={pdfSource}
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
		autoScrollMultiplier: readerSettings.autoScrollMultiplier,
		reservePlayerSpace,
		scrollContainerRef,
		onAutoScrollChange: () => {},
	};
	return <BookReaderContinuous {...continuousProps} />;
}
