import "@/test-utils/setup-dom";
import { expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";

mock.module("./book-reader-continuous", () => ({
	BookReaderContinuous: () => <div data-testid="continuous-engine" />,
}));
mock.module("./book-reader-paginated", () => ({
	BookReaderPaginated: () => <div data-testid="paginated-engine" />,
}));
mock.module("./book-reader-manga", () => ({
	BookReaderManga: () => <div data-testid="manga-engine" />,
}));

const { ReaderEngine } = await import("./reader-engine");
const { defaultReaderSettings, readerThemes } = await import(
	"@/lib/reader/settings"
);
const { defaultMangaReaderSettings } = await import(
	"@/lib/reader/manga-settings"
);
const defaultPresentation = {
	readAs: "text",
	resolvedAs: "text",
	textLayout: "scroll",
	comicLayout: "single-page",
	engine: "text-scroll",
	supportsComic: true,
} as const;

const baseProps = {
	book: { language: "ja", sections: [] },
	htmlContent: "",
	theme: readerThemes[0],
	readerSettings: defaultReaderSettings,
	mangaSettings: defaultMangaReaderSettings,
	initialPosition: undefined,
	initialBookmark: undefined,
	onExploredCharCountChange: () => {},
	onSectionProgressChange: () => {},
	onToggleChrome: () => {},
	controllerRef: () => {},
};

test.each([
	["text-scroll", "continuous-engine"],
	["text-paginated", "paginated-engine"],
	["comic", "manga-engine"],
] as const)("selects the %s reader engine", (engine, testId) => {
	const view = render(
		<ReaderEngine
			{...baseProps}
			presentation={{ ...defaultPresentation, engine }}
		/>,
	);
	expect(view.getByTestId(testId)).toBeTruthy();
});
