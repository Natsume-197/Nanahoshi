import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
	getDefaultHomeLayout,
	HOME_LAYOUT_STORAGE_KEY,
	setHomeLayout,
} from "@/lib/home-layout-store";
import { m } from "@/paraglide/messages";
import { HomeLayoutModal } from "../home-layout-modal";

afterEach(() => {
	cleanup();
	setHomeLayout(getDefaultHomeLayout());
	window.localStorage.removeItem(HOME_LAYOUT_STORAGE_KEY);
});

describe("HomeLayoutModal", () => {
	it("saves visibility and precise order changes for the unified dashboard", async () => {
		const view = render(<HomeLayoutModal />);

		fireEvent.click(
			view.getByRole("button", { name: m["home.organize_action"]() }),
		);
		fireEvent.click(
			await view.findByRole("menuitem", {
				name: m["home.organize_action"](),
			}),
		);

		expect(
			await view.findByRole("heading", {
				name: m["home.organize_title"](),
			}),
		).toBeTruthy();
		expect(view.getAllByRole("switch")).toHaveLength(8);

		fireEvent.click(
			view.getByRole("switch", {
				name: (accessibleName) =>
					accessibleName.startsWith(m["home.hero_continue"]()),
			}),
		);
		fireEvent.click(
			view.getByRole("switch", {
				name: m["recs.books_for_you"](),
			}),
		);
		fireEvent.click(
			view.getByRole("button", {
				name: m["home.organize_move_down"]({
					name: m["home.hero_continue"](),
				}),
			}),
		);
		fireEvent.click(view.getByRole("button", { name: m["common.save"]() }));

		await waitFor(() => {
			expect(
				view.queryByRole("heading", {
					name: m["home.organize_title"](),
				}),
			).toBeNull();
		});

		const stored = JSON.parse(
			window.localStorage.getItem(HOME_LAYOUT_STORAGE_KEY) ?? "[]",
		);
		expect(stored.slice(0, 3)).toEqual([
			{ id: "recently-added", visible: true },
			{ id: "continue", visible: false },
			{ id: "books-for-you", visible: false },
		]);
	});
});
