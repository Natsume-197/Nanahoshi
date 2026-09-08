import "@/test-utils/setup-dom";

import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useState } from "react";

type ShelfPage = { items: { bookId: number; title: string }[]; total: number };
const pending = new Map<
	string,
	{ resolve: (page: ShelfPage) => void; reject: (error: Error) => void }
>();
function shelfOptions(format: string) {
	return {
		queryOptions: ({
			input,
		}: {
			input: { username: string; status?: string; offset: number };
		}) => ({
			queryKey: [format, input.username, input.status ?? "all", input.offset],
			queryFn: () =>
				new Promise<ShelfPage>((resolve, reject) => {
					pending.set(`${format}:${input.username}:${input.status ?? "all"}`, {
						resolve,
						reject,
					});
				}),
		}),
	};
}
mock.module("@/utils/orpc", () => ({
	orpc: {
		bookShelf: { getPublicShelfPaginated: shelfOptions("books") },
		audiobookShelf: { getPublicShelfPaginated: shelfOptions("audiobooks") },
	},
}));
mock.module("@/hooks/use-ui-snapshot-state", () => ({
	useUiSnapshotState: (_key: string, initial: number) => useState(initial),
}));
mock.module("@/components/books/book-card", () => ({
	BookCard: ({ title }: { title: string }) => (
		<div data-testid="book">{title}</div>
	),
}));
mock.module("@/components/books/book-card-skeleton", () => ({
	BookCardSkeleton: () => <div data-testid="skeleton" />,
}));
mock.module("@/components/libraries/query-error-state", () => ({
	QueryErrorState: () => <div role="alert">Request failed</div>,
}));

const { ProfileBooksGrid } = await import("./profile-books-grid");
const { ProfileAudiobooksGrid } = await import("./profile-audiobooks-grid");

afterEach(() => {
	cleanup();
	pending.clear();
});

for (const [format, Grid] of [
	["books", ProfileBooksGrid],
	["audiobooks", ProfileAudiobooksGrid],
] as const) {
	describe(`${format} shelf filters`, () => {
		test("keeps mounted cards while a filter loads, then replaces them with its result", async () => {
			const client = new QueryClient({
				defaultOptions: { queries: { retry: false } },
			});
			client.setQueryData([format, "alice", "all", 0], {
				items: [{ bookId: 1, title: "Previous book" }],
				total: 1,
			});
			const page = (status?: "completed", username = "alice") => (
				<QueryClientProvider client={client}>
					<Grid username={username} status={status} onStatusChange={() => {}} />
				</QueryClientProvider>
			);
			const view = render(page());
			const originalCard = view.getByTestId("book");
			view.rerender(page("completed"));
			expect(view.queryAllByTestId("skeleton")).toHaveLength(0);
			expect(view.getByTestId("book")).toBe(originalCard);
			await act(async () => {
				pending.get(`${format}:alice:completed`)?.resolve({
					items: [{ bookId: 2, title: "Completed book" }],
					total: 1,
				});
			});
			await waitFor(() =>
				expect(view.getByTestId("book").textContent).toBe("Completed book"),
			);
			view.rerender(page("completed", "bob"));
			expect(view.queryByTestId("book")).toBeNull();
			expect(view.queryAllByTestId("skeleton").length).toBeGreaterThan(0);
			view.unmount();
			client.clear();
		});
	});
}
