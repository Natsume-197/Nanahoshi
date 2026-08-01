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
