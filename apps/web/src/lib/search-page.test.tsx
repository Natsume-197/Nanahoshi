import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";
import type { QueryClient as TestQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { act, cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);

const book = {
	uuid: "book-1",
	title: "Alpha",
	filename: "alpha.epub",
	cover: null,
	authors: [],
};
const top = mock(async () => ({
	hits: [{ ...book, type: "book" }],
	availableTypes: ["book", "author"],
	mediaPages: {
		books: {
			books: [book],
			pagination: { cursor: "next", hasMore: true, totalHits: 2 },
		},
		audiobooks: {
			audiobooks: [],
			pagination: { hasMore: false, totalHits: 0 },
		},
	},
}));
const searchBooks = mock(async () => ({
	books: [{ ...book, uuid: "book-2" }],
	pagination: { hasMore: false, totalHits: 2 },
}));
const searchAuthors = mock(() => new Promise<never>(() => {}));
const navigate = mock(async () => {});
const router = {
	latestLocation: { href: "/dashboard/search?q=Alpha", state: { key: "test" } },
	navigate,
};
type RouteConfig = {
	component: () => ReactNode;
	loader?: (input: {
		context: { queryClient: TestQueryClient; orpc: typeof rpc };
		deps: { query: string };
	}) => void;
};
let route: RouteConfig;
const passThrough = ({ children }: { children: ReactNode }) => <>{children}</>;
mock.module("@tanstack/react-router", () => ({
	createFileRoute: () => (config: RouteConfig) => {
		route = config;
		return { ...config, useSearch: () => ({ q: "Alpha" }) };
	},
	useRouter: () => router,
	redirect: (value: unknown) => value,
	Link: passThrough,
}));
const options = ({
	input,
	...rest
}: {
	input: { query: string; limit: number; pageSize?: number };
	staleTime?: number;
}) => ({
	queryKey: ["top", input],
	queryFn: top,
	...rest,
});
const rpc = {
	search: { top: { queryOptions: options } },
	readListen: {
		searchPairings: {
			queryOptions: () => ({ queryKey: ["pairings"], queryFn: async () => [] }),
		},
	},
};
mock.module("@/utils/orpc", () => ({
	orpc: rpc,
	client: {
		books: { search: searchBooks },
		authors: { search: searchAuthors },
	},
}));
mock.module("@/components/books/book-context-menu", () => ({
	BookContextMenuRoot: passThrough,
	BookContextMenuTrigger: passThrough,
}));
let resultRenders = 0;
mock.module("@/components/shared/virtualized-result-list", () => ({
	VirtualizedResultList: <T extends { uuid: string }>({
		items,
		renderItem,
	}: {
		items: T[];
		renderItem: (item: T) => ReactNode;
	}) => {
		resultRenders++;
		return (
			<div>
				{items.map((item) => (
					<div key={item.uuid}>{renderItem(item)}</div>
				))}
			</div>
		);
	},
}));
mock.module("@/components/shared/category-selector", () => ({
	CategorySelector: ({
		items,
		onValueChange,
	}: {
		items: { value: string }[];
		onValueChange: (value: string) => void;
	}) => (
		<fieldset aria-label="filters">
			{items.map((item) => (
				<button
					type="button"
					key={item.value}
					onClick={() => onValueChange(item.value)}
				>
					{item.value}
				</button>
			))}
		</fieldset>
	),
}));
let loadMore: (() => void) | undefined;
mock.module("@/hooks/use-infinite-scroll", () => ({
	useInfiniteScroll: ({ fetchNextPage }: { fetchNextPage: () => void }) => {
		loadMore = fetchNextPage;
		return { loadMoreRef: () => {} };
	},
}));
await import("@/routes/dashboard/search");
const Page = route.component;
let queryClient: TestQueryClient;
afterEach(() => {
	cleanup();
	queryClient?.clear();
	localStorage.clear();
	top.mockClear();
	searchBooks.mockClear();
	navigate.mockClear();
	resultRenders = 0;
});
function mount() {
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	route.loader?.({
		context: { queryClient, orpc: rpc },
		deps: { query: "Alpha" },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<Page />
		</QueryClientProvider>,
	);
}

test("route prefetch and both media lists share one request; later pages stay compact", async () => {
	const view = mount();
	expect(route.loader).toBeTypeOf("function");
	await waitFor(() => expect(view.getByText("Alpha")).toBeTruthy());
	expect(top).toHaveBeenCalledTimes(1);
	expect(searchBooks).not.toHaveBeenCalled();
	await act(async () => loadMore?.());
	await waitFor(() => expect(searchBooks).toHaveBeenCalledTimes(1));
	expect(searchBooks).toHaveBeenCalledWith(
		expect.objectContaining({ cursor: "next", compact: true, limit: 30 }),
		expect.objectContaining({ signal: expect.any(AbortSignal) }),
	);
});

test("typing does not rerender results or search until submission", async () => {
	const view = mount();
	await waitFor(() => expect(view.getByText("Alpha")).toBeTruthy());
	const initialRenders = resultRenders;
	const input = view.getByRole("searchbox");
	for (const value of ["B", "Be", "Bet", "Beta"])
		fireEvent.change(input, { target: { value } });
	expect(resultRenders).toBe(initialRenders);
	expect(top).toHaveBeenCalledTimes(1);
	expect(navigate).not.toHaveBeenCalled();
	const form = input.closest("form");
	if (!form) throw new Error("Search form missing");
	fireEvent.submit(form);
	expect(navigate).toHaveBeenCalledWith({
		to: "/dashboard/search",
		search: { q: "Beta" },
	});
});

test("category controls remain usable while a category is loading", async () => {
	const view = mount();
	await waitFor(() => expect(view.getByText("Alpha")).toBeTruthy());
	fireEvent.click(view.getByRole("button", { name: "authors", exact: true }));
	await waitFor(() => expect(searchAuthors).toHaveBeenCalled());
	expect(view.getByRole("group", { name: "filters" })).toBeTruthy();
	fireEvent.click(view.getByRole("button", { name: "all", exact: true }));
	expect(view.getByText("Alpha")).toBeTruthy();
});
