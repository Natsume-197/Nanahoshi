export interface MangaPageGeometry {
	width: number;
	height: number;
}

function positiveNumber(value: string | null | undefined): number | undefined {
	if (!value || !/^\d+(?:\.\d+)?$/u.test(value.trim())) return undefined;
	const number = Number(value);
	return number > 0 ? number : undefined;
}

function geometryFromAttributes(element: Element | null) {
	const width = positiveNumber(
		element?.getAttribute("data-ttu-natural-width") ??
			element?.getAttribute("width"),
	);
	const height = positiveNumber(
		element?.getAttribute("data-ttu-natural-height") ??
			element?.getAttribute("height"),
	);
	return width && height ? { width, height } : undefined;
}

export function readMangaPageGeometry(
	page: Element,
): MangaPageGeometry | undefined {
	const image = page.querySelector("img, svg image");
	const imageGeometry = geometryFromAttributes(image);
	if (imageGeometry) return imageGeometry;

	const svg = image?.closest("svg") ?? page.querySelector("svg");
	const viewBox = svg
		?.getAttribute("viewBox")
		?.trim()
		.split(/[\s,]+/u)
		.map(Number);
	if (
		viewBox?.length === 4 &&
		Number.isFinite(viewBox[2]) &&
		Number.isFinite(viewBox[3]) &&
		(viewBox[2] ?? 0) > 0 &&
		(viewBox[3] ?? 0) > 0
	) {
		return { width: viewBox[2] as number, height: viewBox[3] as number };
	}
	return geometryFromAttributes(svg);
}

export function fitMangaPage(
	page: MangaPageGeometry,
	available: MangaPageGeometry,
): MangaPageGeometry {
	const scale = Math.min(
		available.width / page.width,
		available.height / page.height,
	);
	return { width: page.width * scale, height: page.height * scale };
}
