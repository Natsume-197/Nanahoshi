import "@/test-utils/setup-dom";

process.env.VITE_SERVER_URL = "http://localhost:3000";

import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { storeHideCardText } from "@/hooks/use-card-display-preferences";
import { coverPresets } from "@/utils/covers";
import { BookCardShell } from "../book-card-shell";

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
});
