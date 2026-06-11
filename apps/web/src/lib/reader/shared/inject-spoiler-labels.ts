/**
 * Append the "ネタバレ" spoiler-cover label to every spoiler image inside
 * `root`. Idempotent — images that already carry a label are skipped, so it is
 * safe to call again when a section is re-rendered (paginated mode). CSS only
 * shows the label under the `book-content--hide-spoiler-image` class, so the
 * label can always be injected regardless of the current setting.
 */
export function injectSpoilerLabels(root: ParentNode, doc: Document) {
	for (const el of Array.from(
		root.querySelectorAll("[data-ttu-spoiler-img]"),
	)) {
		if (el.querySelector(".spoiler-label")) continue;
		const label = doc.createElement("span");
		label.title = "Show Image";
		label.classList.add("spoiler-label");
		label.setAttribute("aria-hidden", "true");
		label.innerText = "ネタバレ";
		el.appendChild(label);
	}
}
