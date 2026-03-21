export {
	getCharacterCountByLanguage,
	getJapaneseCharacterCount,
	getTextCharacterCount,
} from "./character-counter";
export { EpubBook } from "./parser";
export type {
	Bookmark,
	EpubMetadata,
	NavigationItem,
	Section,
	SourceImage,
} from "./types";

/** Extract the filename from a path (e.g. "OEBPS/images/cover.png" → "cover.png") */
export function getBaseName(path: string): string {
	const match = path.match(/(?:.*\/)?([^/]+\.(?:png|jpe?g|svg|xhtml|html))$/i);
	return match ? match[1] : path;
}
