import type { HomeSectionId } from "@/lib/home-layout-store";

export type HomeSectionPlaceholderKind =
	| "resume"
	| "book"
	| "square"
	| "collections";

export function getHomeSectionPlaceholderKind(
	id: HomeSectionId,
): HomeSectionPlaceholderKind {
	switch (id) {
		case "continue":
			return "resume";
		case "your-collections":
			return "collections";
		case "audiobooks-for-you":
		case "audiobook-series":
		case "random-audiobooks":
			return "square";
		default:
			return "book";
	}
}
