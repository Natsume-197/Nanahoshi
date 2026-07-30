import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

process.env.VITE_SERVER_URL = "http://localhost:3000";

import type { LibraryRowItem } from "../library-rows";

const { LibraryRows } = await import("../library-rows");

afterEach(cleanup);

function item(overrides: Partial<LibraryRowItem> = {}): LibraryRowItem {
	return {
		id: 1,
		uuid: "11111111-1111-1111-1111-111111111111",
		name: "TMW Collection",
		mediaType: "ebook",
		bookCount: 348,
		pathCount: 1,
		hasEnabledPath: true,
		unreachablePathCount: 0,
		lastScannedAt: null,
		previewCovers: [],
		...overrides,
	};
}

/** The menu renders in a portal outside the render container. */
async function openedMenuItems(): Promise<Element[]> {
	await waitFor(() =>
		expect(
			document.querySelectorAll('[role="menuitem"]').length,
		).toBeGreaterThan(0),
	);
	return [...document.querySelectorAll('[role="menuitem"]')];
}

function renderRows(items: LibraryRowItem[], handlers = {}) {
	const props = {
		onOpen: mock(() => undefined),
		onScan: mock(() => undefined),
		onUpload: mock(() => undefined),
		onDelete: mock(() => undefined),
		...handlers,
	};
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<QueryClientProvider client={queryClient}>
			<LibraryRows
				items={items}
				isLoading={false}
				canScan
				canUpload
				canDelete
				{...props}
			/>
		</QueryClientProvider>,
	);
	return { ...view, ...props };
}

describe("LibraryRows", () => {
	it("summarises a library in one line and opens it from the row itself", () => {
		const view = renderRows([item()]);

		expect(view.getByText(/348 books/)).toBeTruthy();
		expect(view.getByText("Never scanned")).toBeTruthy();
		fireEvent.click(
			view.getByRole("button", { name: "Open TMW Collection settings" }),
		);
		expect(view.onOpen).toHaveBeenCalledTimes(1);
	});

	it("flags a library with no usable folder instead of a green all-clear", async () => {
		const view = renderRows([
			item({ hasEnabledPath: false, pathCount: 0, bookCount: 0 }),
		]);

		expect(view.getByText("Folder needed")).toBeTruthy();
		// Nothing to scan yet, so the action must not look available.
		fireEvent.click(
			view.getByRole("button", { name: "More actions for TMW Collection" }),
		);
		const scan = (await openedMenuItems()).find(
			(node) => node.textContent === "Scan now",
		);
		expect(scan).toBeDefined();
		expect(scan?.getAttribute("aria-disabled")).toBe("true");
	});

	it("warns about unreachable folders", () => {
		const view = renderRows([item({ unreachablePathCount: 2 })]);

		expect(view.getByText("2 unreachable folders")).toBeTruthy();
	});

	it("hides uploads for audiobook libraries", async () => {
		const view = renderRows([item({ mediaType: "audiobook", bookCount: 1 })]);

		fireEvent.click(
			view.getByRole("button", { name: "More actions for TMW Collection" }),
		);
		const labels = (await openedMenuItems()).map((node) => node.textContent);
		expect(labels).toContain("Rename");
		expect(labels).not.toContain("Upload books");
	});
});
