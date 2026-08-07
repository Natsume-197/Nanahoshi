import "@/test-utils/setup-dom";

process.env.VITE_SERVER_URL = "http://localhost:3000";

import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { storeHideCardText } from "@/hooks/use-card-display-preferences";
import { coverPresets } from "@/utils/covers";
import {
	BookCardShell,
	estimateBookCardShellRowHeight,
} from "../book-card-shell";

afterEach(() => {
	cleanup();
	storeHideCardText(false);
});

describe("BookCardShell", () => {
	it("can hide card text without removing the accessible action name", () => {
		storeHideCardText(true);
		const view = render(
			<BookCardShell
				linkProps={{ to: "/dashboard/books/$uuid", params: { uuid: "b1" } }}
				ariaLabel="The visible cover name"
				onCardAction={() => {}}
				fullCardAction
				coverPreset={coverPresets.small}
				title="Hidden title"
				subtitle="Hidden author"
			/>,
		);

		expect(view.getByText("Hidden title").parentElement?.className).toContain(
			"hidden",
		);
		expect(
			view.getByRole("button", { name: "The visible cover name" }),
		).toBeDefined();
	});

	it("bleeds the hover fill past the tile instead of padding it", () => {
		const view = render(
			<BookCardShell
				linkProps={{ to: "/dashboard/books/$uuid", params: { uuid: "b1" } }}
				ariaLabel="Hovered book"
				onCardAction={() => {}}
				fullCardAction
				coverPreset={coverPresets.small}
				title="Hovered book"
			/>,
		);

		const shell = view.container.querySelector(
			'[data-slot="book-card-shell"]',
		) as HTMLElement;
		const fill = shell.querySelector("[aria-hidden]") as HTMLElement;
		// At inset-0 the fill hides behind the cover and only shows under it.
		expect(fill.className).toContain("-inset-x-1.5");
		expect(fill.className).toContain("md:-inset-2");
		// Padding on the tile would push covers off the section heading's line.
		expect(shell.className).not.toContain("p-2");
	});

	it("keeps text visible on horizontal Recent cards", () => {
		storeHideCardText(true);
		const view = render(
			<BookCardShell
				linkProps={{ to: "/dashboard/books/$uuid", params: { uuid: "b1" } }}
				ariaLabel="Recent book"
				onCardAction={() => {}}
				fullCardAction
				coverPreset={coverPresets.small}
				title="Recent title"
				subtitle="Recent author"
				orientation="horizontal"
			/>,
		);

		expect(view.getByText("Recent title")).toBeDefined();
		expect(view.getByText("Recent author")).toBeDefined();
	});

	it("sizes carousel tile titles for the phone width they are read at", () => {
		const view = render(
			<BookCardShell
				linkProps={{ to: "/dashboard/books/$uuid", params: { uuid: "b1" } }}
				ariaLabel="Tile book"
				onCardAction={() => {}}
				fullCardAction
				coverPreset={coverPresets.small}
				compactTextBlock
				title="A rather long light novel title, volume 3"
				subtitle="An author"
			/>,
		);

		const title = view.getByText("A rather long light novel title, volume 3");
		// 18px next to a 20px section heading on a 150px tile is no hierarchy.
		expect(title.className).toContain("text-base");
		expect(title.className).toContain("md:text-lg");
	});

	it("lets a Continue card end where its content ends", () => {
		const view = render(
			<BookCardShell
				linkProps={{ to: "/dashboard/books/$uuid", params: { uuid: "b1" } }}
				ariaLabel="Short"
				onCardAction={() => {}}
				fullCardAction
				coverPreset={coverPresets.small}
				orientation="horizontal"
				title="Short"
			/>,
		);

		// No reserved second line: a one-line title with no author must not hold
		// an empty row open.
		expect(view.getByText("Short").className).not.toContain("min-h");
		expect(view.getByText("Short").parentElement?.className).not.toContain(
			"min-h",
		);
	});

	it("mats letterboxed square artwork on a flat color plate, not a blurred copy", () => {
		const view = render(
			<BookCardShell
				linkProps={{
					to: "/dashboard/audiobooks/$uuid",
					params: { uuid: "a1" },
				}}
				ariaLabel="An audiobook in a mixed grid"
				onCardAction={() => {}}
				fullCardAction
				coverFilename="cover.avif"
				coverPreset={coverPresets.small}
				square
				tint="#3f6f9a"
				title="An audiobook in a mixed grid"
			/>,
		);

		// One image only: the second one used to be a blown-up blurred copy filling
		// the 2/3 frame's top and bottom bands.
		expect(view.container.querySelectorAll("img")).toHaveLength(1);
		const frame = view.container.querySelector(
			'[data-slot="book-card-cover"]',
		) as HTMLElement;
		expect(frame.getAttribute("style")).toContain("color-mix");
		expect(frame.getAttribute("style")).toContain("#3f6f9a");
	});

	it("keeps the dominant-color placeholder on 2/3 covers that fill their frame", () => {
		const view = render(
			<BookCardShell
				linkProps={{ to: "/dashboard/books/$uuid", params: { uuid: "b1" } }}
				ariaLabel="A book in a mixed grid"
				onCardAction={() => {}}
				fullCardAction
				coverFilename="cover.avif"
				coverPreset={coverPresets.small}
				tint="#3f6f9a"
				title="A book in a mixed grid"
			/>,
		);

		const frame = view.container.querySelector(
			'[data-slot="book-card-cover"]',
		) as HTMLElement;
		expect(frame.getAttribute("style")).not.toContain("color-mix");
		expect(frame.getAttribute("style")).toContain("rgb(");
	});

	it("uses the whole Continue card as the immediate action without rendering a detail link", () => {
		const activate = mock(() => {});
		const view = render(
			<BookCardShell
				linkProps={{
					to: "/dashboard/audiobooks/$uuid",
					params: { uuid: "a1" },
				}}
				ariaLabel="A short audiobook"
				onCardAction={activate}
				cardActionAriaLabel="Listen to A short audiobook"
				fullCardAction
				coverPreset={coverPresets.small}
				title="A short audiobook"
			/>,
		);

		expect(view.queryByRole("link")).toBeNull();
		expect(
			view.getByText("A short audiobook").parentElement?.className,
		).toContain("pointer-events-none");
		fireEvent.click(
			view.getByRole("button", { name: "Listen to A short audiobook" }),
		);
		expect(activate).toHaveBeenCalledTimes(1);
	});
	it("uses the square frame instead of matting when the whole grid is square", () => {
		const view = render(
			<BookCardShell
				linkProps={{
					to: "/dashboard/audiobooks/$uuid",
					params: { uuid: "a1" },
				}}
				ariaLabel="An audiobook in an audiobook grid"
				onCardAction={() => {}}
				fullCardAction
				coverFilename="cover.avif"
				coverPreset={coverPresets.small}
				square
				coverFrameRatio="square"
				tint="#3f6f9a"
				title="An audiobook in an audiobook grid"
			/>,
		);

		const frame = view.container.querySelector(
			'[data-slot="book-card-cover"]',
		) as HTMLElement;
		// Nothing to mat: the artwork fills its own frame edge to edge.
		expect(frame.className).toContain("aspect-square");
		expect(frame.getAttribute("style")).not.toContain("color-mix");
	});
});

describe("estimateBookCardShellRowHeight", () => {
	it("reserves a shorter row for a grid of square artwork", () => {
		const columnWidth = 216;
		const book = estimateBookCardShellRowHeight({ columnWidth });
		const square = estimateBookCardShellRowHeight({
			columnWidth,
			square: true,
		});

		// A square cover is a third shorter than a 2/3 one at the same width; an
		// estimator that ignored `square` left a gap under every virtualized row.
		expect(book - square).toBe((columnWidth - 16) / 2);
	});
});
