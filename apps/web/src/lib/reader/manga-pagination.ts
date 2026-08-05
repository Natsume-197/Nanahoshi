import type { MangaReadingDirection } from "./manga-settings";

export type ResolvedMangaReadingDirection = "ltr" | "rtl";

export function resolveMangaReadingDirection(
	direction: MangaReadingDirection,
	language: string,
	declaredDirection?: string | null,
): ResolvedMangaReadingDirection {
	if (direction !== "auto") return direction;
	if (declaredDirection === "ltr" || declaredDirection === "rtl") {
		return declaredDirection;
	}
	return language.trim().toLowerCase().split(/[-_]/)[0] === "ja"
		? "rtl"
		: "ltr";
}

/**
 * Produces logical spreads in reading order. Explicit double-page mode starts
 * with the first page, so the opening viewport is a real two-page spread;
 * landscape artwork is never squeezed beside another page.
 */
export function buildMangaSpreads(
	pageCount: number,
	doublePage: boolean,
	landscapePages: ReadonlySet<number> = new Set(),
): number[][] {
	if (pageCount <= 0) return [];
	const spreads: number[][] = [];
	let index = 0;
	while (index < pageCount) {
		if (
			doublePage &&
			!landscapePages.has(index) &&
			index + 1 < pageCount &&
			!landscapePages.has(index + 1)
		) {
			spreads.push([index, index + 1]);
			index += 2;
		} else {
			spreads.push([index]);
			index += 1;
		}
	}
	return spreads;
}
