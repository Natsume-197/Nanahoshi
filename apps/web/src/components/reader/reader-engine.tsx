import type { MangaReaderSettings } from "@/lib/reader/manga-settings";
import type { ReaderPresentation } from "@/lib/reader/reader-presentation";
import type { ReaderSettings, ReaderTheme } from "@/lib/reader/settings";
import type {
	ReaderBookData,
	ReaderBookmark,
	SectionWithProgress,
} from "@/lib/reader/types";
import { BookReaderContinuous } from "./book-reader-continuous";
import { BookReaderManga } from "./book-reader-manga";
import { BookReaderPaginated } from "./book-reader-paginated";
import type { BookReaderApi } from "./reader-shared-props";

interface ReaderEngineProps {
	presentation: ReaderPresentation;
	book: Pick<ReaderBookData, "language" | "presentation" | "sections">;
	htmlContent: string;
	theme: ReaderTheme;
	readerSettings: ReaderSettings;
	mangaSettings: MangaReaderSettings;
	initialPosition: ReaderBookmark | undefined;
	initialBookmark: ReaderBookmark | undefined;
	onExploredCharCountChange: (count: number) => void;
	onSectionProgressChange: (progress: Map<string, SectionWithProgress>) => void;
	onToggleChrome: () => void;
	controllerRef: (controller: BookReaderApi | null) => void;
}

/**
 * Deep seam over the three reader engines. Callers provide normalized book
 * data and preferences; engine-specific props and unsupported details remain
 * internal to this module.
 */
export function ReaderEngine({
	presentation,
	book,
	htmlContent,
	theme,
	readerSettings,
	mangaSettings,
	initialPosition,
	initialBookmark,
	onExploredCharCountChange,
	onSectionProgressChange,
	onToggleChrome,
	controllerRef,
}: ReaderEngineProps) {
	if (presentation.engine === "comic") {
		return (
			<BookReaderManga
				htmlContent={htmlContent}
				theme={theme}
				layout={presentation.comicLayout}
				language={book.language}
				pageProgressionDirection={book.presentation?.pageProgressionDirection}
				readingDirection={mangaSettings.readingDirection}
				sections={book.sections}
				initialPosition={initialPosition}
				initialBookmark={initialBookmark}
				onExploredCharCountChange={onExploredCharCountChange}
				onSectionProgressChange={onSectionProgressChange}
				onToggleChrome={onToggleChrome}
				apiRef={controllerRef}
			/>
		);
	}

	const verticalMode = readerSettings.writingMode === "vertical-rl";
	const sharedProps = {
		htmlContent,
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
		sections: book.sections,
		initialPosition,
		initialBookmark,
		onExploredCharCountChange,
		onSectionProgressChange,
		apiRef: controllerRef,
	};

	if (presentation.engine === "text-paginated") {
		return (
			<BookReaderPaginated
				{...sharedProps}
				avoidPageBreak={readerSettings.avoidPageBreak}
				pageColumns={readerSettings.pageColumns}
			/>
		);
	}

	return (
		<BookReaderContinuous
			{...sharedProps}
			autoPositionOnResize={readerSettings.autoPositionOnResize}
			autoScrollMultiplier={readerSettings.autoScrollMultiplier}
			onAutoScrollChange={() => {}}
		/>
	);
}
