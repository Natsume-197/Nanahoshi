/**
 * Groups runs of consecutive image-only sections (each illustration/visual
 * page is its own EPUB spine file, hence its own section) into one section
 * element, so paginated multi-column layouts fill every column with an image
 * instead of leaving all but the first blank. Isolated image-only sections
 * keep their structure and get the full-width centered treatment in
 * reader.css instead.
 *
 * The first section never joins a run: the cover renders alone, like on
 * dedicated e-readers.
 */
export function mergeImageOnlySectionRuns(
	sections: Element[],
	document: Document,
): Element[] {
	// Landscape spreads (wrap-around jackets, two-page art) don't belong in a
	// column pair — column width would shrink them. They stay isolated and get
	// the full-width treatment. Unknown dimensions count as portrait: the runs
	// this targets are visual pages, which always carry reserved dimensions.
	const isLandscape = (el: Element) => {
		const img = el.querySelector("img, svg image");
		if (!img) return false;
		const width = Number(
			img.getAttribute("data-nanahoshi-natural-width") ??
				img.getAttribute("width"),
		);
		const height = Number(
			img.getAttribute("data-nanahoshi-natural-height") ??
				img.getAttribute("height"),
		);
		return width > 0 && height > 0 && width > height;
	};

	const isImageOnly = (el: Element) =>
		el.querySelector(":scope > .nanahoshi-no-text") !== null &&
		el.querySelector("img, svg image") !== null &&
		!isLandscape(el);

	const result: Element[] = [];
	let run: Element[] = [];

	const flushRun = () => {
		if (run.length >= 2) {
			const wrapper = document.createElement("div");
			// The wrapper adopts the first member's identity (renderSection reads
			// section.id; the page manager keys chapter progress on it). Moving
			// the id up keeps it unique within the rendered section.
			wrapper.id = run[0].id;
			run[0].removeAttribute("id");
			wrapper.append(...run);
			result.push(wrapper);
		} else {
			result.push(...run);
		}
		run = [];
	};

	sections.forEach((el, index) => {
		if (index > 0 && isImageOnly(el)) {
			run.push(el);
		} else {
			flushRun();
			result.push(el);
		}
	});
	flushRun();

	return result;
}
