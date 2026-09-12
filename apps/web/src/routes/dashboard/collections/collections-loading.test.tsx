import { expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
	createFileRoute: () => (options: { component: React.ComponentType }) => ({
		options,
		useParams: () => ({ collectionId: "test-collection" }),
		useSearch: () => ({}),
		useNavigate: () => () => {},
	}),
	useNavigate: () => () => {},
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="/">{children}</a>
	),
	Outlet: () => null,
}));

let abilitiesLoading = true;
let previewsLoading = false;
mock.module("@/hooks/use-abilities", () => ({
	useAbilities: () => ({
		can: () => !abilitiesLoading,
		isLoading: abilitiesLoading,
	}),
}));

mock.module("@/components/books/book-context-menu", () => ({
	BookContextMenu: ({ children }: { children: React.ReactNode }) => children,
	BookContextMenuRoot: ({ children }: { children: React.ReactNode }) =>
		children,
	BookContextMenuTrigger: ({ children }: { children: React.ReactNode }) =>
		children,
}));

mock.module("@/hooks/use-collection-previews", () => ({
	useCollectionPreviews: () => ({
		byId: new Map(),
		isLoading: previewsLoading,
	}),
	resolveCollectionPreview: () => ({}),
}));

const queryOptions = () => ({
	queryKey: ["disabled-collection-query"],
	queryFn: async () => [],
});
mock.module("@/components/shared/create-collection-button", () => ({
	CreateCollectionButton: () => null,
}));
mock.module("@/utils/orpc", () => ({
	client: { collections: {} },
	queryClient: new QueryClient(),
	orpc: {
		collections: {
			getDetails: { queryOptions },
			listItems: {
				infiniteOptions: () => ({ ...queryOptions(), initialPageParam: 0 }),
			},
			list: { queryOptions },
			discover: { queryOptions },
		},
		shelves: { summaries: { queryOptions } },
	},
}));

const { Route: DetailRoute } = await import("./$collectionId");
const { Route: ListRoute } = await import("./index");

for (const [name, route] of [
	["detail", DetailRoute],
	["list", ListRoute],
] as const) {
	test(`${name} does not render an empty collection while permissions are pending`, () => {
		const Page = route.options.component as React.ComponentType;
		const markup = renderToStaticMarkup(
			<QueryClientProvider client={new QueryClient()}>
				<Page />
			</QueryClientProvider>,
		);
		expect(markup.includes("No books yet")).toBe(false);
		expect(markup.includes("No book collections yet")).toBe(false);
		expect(markup.includes('data-slot="skeleton"')).toBe(true);
	});
}

test("list waits for previews but still shows a genuinely empty collection list", () => {
	abilitiesLoading = false;
	const Page = ListRoute.options.component as React.ComponentType;
	const client = new QueryClient();
	client.setQueryData(["disabled-collection-query"], []);
	const renderPage = () =>
		renderToStaticMarkup(
			<QueryClientProvider client={client}>
				<Page />
			</QueryClientProvider>,
		);

	previewsLoading = true;
	expect(renderPage().includes("No book collections yet")).toBe(false);
	expect(renderPage().includes('data-slot="skeleton"')).toBe(true);
	previewsLoading = false;
	expect(renderPage().includes("No book collections yet")).toBe(true);
});
