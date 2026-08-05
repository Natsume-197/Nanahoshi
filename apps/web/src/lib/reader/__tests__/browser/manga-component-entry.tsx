import { createRoot } from "react-dom/client";
import { BookReaderManga } from "@/components/reader/book-reader-manga";

const pageCount = 4;
const htmlContent = Array.from(
	{ length: pageCount },
	(_, index) =>
		`<div id="page-${index}"><div class="ttu-book-html-wrapper ttu-no-text"><div class="ttu-book-body-wrapper ttu-no-text"><div class="main"><svg width="100%" height="100%" viewBox="0 0 1439 2048"><image width="1439" height="2048" /></svg></div></div></div></div>`,
).join("");
const sections = Array.from({ length: pageCount }, (_, index) => ({
	reference: `page-${index}`,
	charactersWeight: 1,
	startCharacter: index,
	characters: 1,
}));

createRoot(document.getElementById("root") as HTMLElement).render(
	<BookReaderManga
		htmlContent={htmlContent}
		theme={{
			id: "test",
			fontColor: "white",
			backgroundColor: "black",
			selectionFontColor: "white",
			selectionBackgroundColor: "black",
			hintFuriganaShadowColor: "black",
			hintFuriganaFontColor: "white",
			tooltipTextFontColor: "white",
		}}
		layout="two-page-spread"
		language="ja"
		readingDirection="rtl"
		sections={sections}
		initialPosition={undefined}
		initialBookmark={undefined}
		onExploredCharCountChange={() => {}}
		onSectionProgressChange={() => {}}
		onToggleChrome={() => {}}
		apiRef={() => {}}
	/>,
);
