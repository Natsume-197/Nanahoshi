import "@/test-utils/setup-dom";

import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

const { cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);

mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({ data: undefined }),
}));

mock.module("@/components/books/shelf-options", () => ({
	getShelfOptions: () => [
		{
			value: "reading",
			label: () => "Reading",
			icon: (props: Record<string, unknown>) => <svg {...props} />,
		},
		{
			value: "completed",
			label: () => "Completed",
			icon: (props: Record<string, unknown>) => <svg {...props} />,
		},
	],
}));

mock.module("@/components/ui/modal", () => ({
	Modal: ({
		title,
		children,
		className,
	}: {
		title: string;
		children: React.ReactNode;
		className?: string;
	}) => (
		<section aria-label={title} className={className}>
			{children}
		</section>
	),
}));

mock.module("@/hooks/books/use-book-context-menu-actions", () => ({
	useBookContextMenuActions: () => ({
		collectionsMemberships: [
			{
				id: "collection-1",
				name: "A collection with a deliberately very long name",
				bookCount: 3,
				inCollection: false,
				isPublic: false,
			},
		],
		currentShelfStatus: "reading",
		handleCreateCollection: mock(async () => true),
		handleRemoveShelf: mock(() => {}),
		handleSetCollectionMembership: mock(() => {}),
		handleSetShelf: mock(() => {}),
		isCollectionActionBusy: false,
		isCollectionsLoading: false,
		isShelfActionBusy: false,
		isShelfLoading: false,
	}),
}));

mock.module("@/hooks/use-abilities", () => ({
	useAbilities: () => ({ can: () => true }),
}));

mock.module("@/utils/orpc", () => ({
	orpc: {
		books: { getBookWithMetadata: { queryOptions: () => ({}) } },
		audiobooks: { getDetails: { queryOptions: () => ({}) } },
	},
}));

const { AddToListModal } = await import("./add-to-list-modal");
const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
const darkTheme = css.slice(
	css.indexOf(".dark {"),
	css.indexOf("\n}\n\n@theme inline"),
);
const normalizedDarkTheme = darkTheme
	.replace(/\s+/g, " ")
	.replace(/\(\s+/g, "(")
	.replace(/\s+\)/g, ")");

afterEach(cleanup);

function renderModal(title = "A normal book title") {
	return render(
		<AddToListModal
			bookUuid="book-1"
			mediaType="ebook"
			open
			onOpenChange={() => {}}
			title={title}
			authorName="Author"
		/>,
	);
}

describe("AddToListModal responsive layout", () => {
	test("long titles wrap inside a width-constrained header", () => {
		const longTitle = "Unbreakable".repeat(20);
		renderModal(longTitle);

		const title = screen.getByText(longTitle);
		expect(title.classList.contains("truncate")).toBe(false);
		expect(title.className).toContain("overflow-wrap:anywhere");
		expect(title.parentElement?.classList.contains("flex-1")).toBe(true);
	});

	test("the create-collection form stacks its controls on narrow screens", () => {
		renderModal();
		fireEvent.click(screen.getByRole("button", { name: /create.*list/i }));

		const form = document.querySelector("form");
		expect(form?.classList.contains("flex-col")).toBe(true);
		expect(form?.classList.contains("sm:flex-row")).toBe(true);
	});

	test("selection and hover states use the app surface tokens", () => {
		renderModal();

		const activeShelf = screen.getByRole("button", { name: "Reading" });
		const inactiveShelf = screen.getByRole("button", { name: "Completed" });
		expect(activeShelf.classList.contains("bg-surface-accent")).toBe(true);
		expect(inactiveShelf.classList.contains("bg-surface-card")).toBe(true);
	});

	test("dark appearance derives tile surfaces from the dark theme", () => {
		expect(darkTheme).toContain("--surface-card: var(--card)");
		expect(normalizedDarkTheme).toContain(
			"--surface-card-hover: color-mix(in oklab, var(--foreground) 8%, var(--card))",
		);
	});
});
