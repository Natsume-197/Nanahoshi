import { createFileRoute, redirect } from "@tanstack/react-router";
import { CatalogPage } from "@/components/catalog/catalog-page";
import {
	allCatalogOptions,
	type CatalogSort,
} from "@/components/catalog/catalog-queries";
import { CatalogView } from "@/components/catalog/catalog-view";
import { readCollectionViewState } from "@/hooks/use-collection-view";

export const Route = createFileRoute("/dashboard/audiobooks/")({
	component: AudiobooksCatalogPage,
	validateSearch: (search: Record<string, unknown>): { library?: string } => ({
		library: typeof search.library === "string" ? search.library : undefined,
	}),
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loaderDeps: ({ search }) => ({ library: search.library }),
	loader: ({ context, deps, location, cause }) => {
		// Start on intent/entry without blocking navigation on the first page.
		// An in-place library filter change already has the live view's state.
		if (typeof window === "undefined" || cause === "stay") return;
		const state = readCollectionViewState<CatalogSort>(
			location,
			"nh-books-view",
			"recent",
		);
		const options = allCatalogOptions(
			{
				format: "audiobook",
				sort: state.sort,
				query: state.search,
				libraryUuid: deps.library,
			},
			context.orpc,
		);
		// Back-navigation owns all its cached pages; prefetch only cold lists.
		if (!context.queryClient.getQueryData(options.queryKey)) {
			void context.queryClient.prefetchInfiniteQuery(options);
		}
	},
});

function AudiobooksCatalogPage() {
	const { library } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<CatalogPage section="audiobooks">
			<CatalogView
				source={{
					kind: "all",
					format: "audiobook",
					libraryUuid: library,
					onLibraryChange: (next) =>
						navigate({ search: { library: next }, replace: true }),
				}}
			/>
		</CatalogPage>
	);
}
