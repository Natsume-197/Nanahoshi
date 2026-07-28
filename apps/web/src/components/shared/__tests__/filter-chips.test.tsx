import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { FilterChips, FilterChipsSkeleton } from "../filter-chips";

afterEach(() => {
	cleanup();
});

// jsdom does no layout, so this checks the shape that decides the height rather
// than the height itself: same row container, same chip count, same size token.
// A skeleton that drifts from the real row is exactly what shifted the home
// dashboard down a row when its format data landed.
describe("FilterChipsSkeleton", () => {
	it("reserves the same row the loaded chips occupy", () => {
		const loaded = render(
			<FilterChips
				value="all"
				options={[
					{ value: "all", label: "All" },
					{ value: "books", label: "Books" },
					{ value: "audiobooks", label: "Audiobooks" },
				]}
				onValueChange={() => {}}
			/>,
		);
		const loadedRow = loaded.container.firstElementChild;
		const loadedChips = [...(loadedRow?.children ?? [])];

		const placeholder = render(<FilterChipsSkeleton count={3} />);
		const placeholderRow = placeholder.container.firstElementChild;
		const placeholderChips = [...(placeholderRow?.children ?? [])];

		expect(placeholderRow?.className).toBe(loadedRow?.className ?? "");
		expect(placeholderChips.length).toBe(loadedChips.length);
		for (const chip of placeholderChips) {
			expect(chip.className).toContain("h-9");
			expect(chip.className).toContain("rounded-full");
		}
		for (const chip of loadedChips) {
			expect(chip.className).toContain("h-9");
			expect(chip.className).toContain("rounded-full");
		}
	});

	it("stays out of the accessibility tree while loading", () => {
		const { container } = render(<FilterChipsSkeleton count={2} />);
		expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
			"true",
		);
	});
});
