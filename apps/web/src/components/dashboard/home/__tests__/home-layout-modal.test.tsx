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
	setHomeLayout("books", getDefaultHomeLayout("books"));
	window.localStorage.removeItem(HOME_LAYOUT_STORAGE_KEY);
});

describe("HomeLayoutModal", () => {
	it("saves visibility and precise order changes for the current view", async () => {
		const view = render(<HomeLayoutModal scope="books" />);

		fireEvent.click(
			view.getByRole("button", { name: m["home.organize_action"]() }),
		);

		expect(
			await view.findByRole("heading", {
				name: m["home.organize_title"](),
			}),
		).toBeTruthy();
		expect(view.getAllByRole("switch")).toHaveLength(7);

		fireEvent.click(
			view.getByRole("switch", {
				name: m["home.continue_reading"](),
			}),
		);
		fireEvent.click(
			view.getByRole("button", {
				name: m["home.organize_move_down"]({
					name: m["home.continue_reading"](),
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
			window.localStorage.getItem(HOME_LAYOUT_STORAGE_KEY) ?? "{}",
		);
		expect(stored.books.slice(0, 2)).toEqual([
			{ id: "books-for-you", visible: true },
			{ id: "continue-reading", visible: false },
		]);
	});
});
