import "@/test-utils/setup-dom";
import { describe, expect, it } from "bun:test";
import { mergeImageOnlySectionRuns } from "../merge-image-sections";

let nextId = 0;

function section({ image = false, text = "", size = "" } = {}) {
	const wrapper = document.createElement("div");
	wrapper.id = `ttu-section-${nextId++}`;

	const htmlDiv = document.createElement("div");
	htmlDiv.className = `ttu-book-html-wrapper${text ? "" : " ttu-no-text"}`;
	if (image) {
		const img = document.createElement("img");
		if (size) {
			const [width, height] = size.split("x");
			img.setAttribute("data-ttu-natural-width", width);
			img.setAttribute("data-ttu-natural-height", height);
		}
		htmlDiv.appendChild(img);
	}
	if (text) {
		const p = document.createElement("p");
		p.textContent = text;
		htmlDiv.appendChild(p);
	}
	wrapper.appendChild(htmlDiv);
	return wrapper;
}

describe("mergeImageOnlySectionRuns", () => {
	it("merges consecutive image-only sections into one element", () => {
		const [cover, chapter, page1, page2, page3] = [
			section({ image: true }),
			section({ text: "hello" }),
			section({ image: true }),
			section({ image: true }),
			section({ image: true }),
		];
		const result = mergeImageOnlySectionRuns(
			[cover, chapter, page1, page2, page3],
			document,
		);

		expect(result).toHaveLength(3);
		expect(result[0]).toBe(cover);
		expect(result[1]).toBe(chapter);
		expect(Array.from(result[2].children)).toEqual([page1, page2, page3]);
	});

	it("adopts the first member's id and keeps it unique", () => {
		const page1 = section({ image: true });
		const page2 = section({ image: true });
		const firstId = page1.id;

		const [, merged] = mergeImageOnlySectionRuns(
			[section({ text: "intro" }), page1, page2],
			document,
		);

		expect(merged.id).toBe(firstId);
		expect(page1.id).toBe("");
		expect(page2.id).not.toBe("");
	});

	it("never merges the cover, even into a following run", () => {
		const cover = section({ image: true });
		const title = section({ image: true });
		const insert = section({ image: true });

		const result = mergeImageOnlySectionRuns([cover, title, insert], document);

		expect(result).toHaveLength(2);
		expect(result[0]).toBe(cover);
		expect(Array.from(result[1].children)).toEqual([title, insert]);
	});

	it("leaves isolated image-only sections untouched", () => {
		const sections = [
			section({ text: "one" }),
			section({ image: true }),
			section({ text: "two" }),
		];
		expect(mergeImageOnlySectionRuns(sections, document)).toEqual(sections);
	});

	it("keeps landscape images out of runs", () => {
		const sections = [
			section({ text: "intro" }),
			section({ image: true, size: "1440x2048" }),
			section({ image: true, size: "1440x2048" }),
			section({ image: true, size: "2048x879" }), // wrap-around jacket
		];
		const result = mergeImageOnlySectionRuns(sections, document);

		expect(result).toHaveLength(3);
		expect(Array.from(result[1].children)).toEqual([sections[1], sections[2]]);
		expect(result[2]).toBe(sections[3]);
	});

	it("does not treat empty no-text sections as images", () => {
		const sections = [
			section({ text: "one" }),
			section(), // blank separator page: no text, no image
			section({ image: true }),
			section({ image: true }),
		];
		const result = mergeImageOnlySectionRuns(sections, document);

		expect(result).toHaveLength(3);
		expect(result[1]).toBe(sections[1]);
		expect(Array.from(result[2].children)).toEqual([sections[2], sections[3]]);
	});
});
