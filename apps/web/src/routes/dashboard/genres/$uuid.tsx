import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { EntityBooksView } from "@/components/catalog/entity-books-view";
import type { SortOption } from "@/components/shared/sort-select";
import { m } from "@/paraglide/messages";
import type { BookSortMode } from "@/utils/filter-sort-books";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/genres/$uuid")({
	component: GenreDetailPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: ({ context, params }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(
			orpc.books.listByGenre.queryOptions({
				input: { genreUuid: params.uuid },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.genres.getByUuid.queryOptions({
				input: { uuid: params.uuid },
			}),
		);
	},
});

function GenreDetailPage() {
	const { uuid } = Route.useParams();

	const { data: rawBooks, isLoading } = useQuery({
		...orpc.books.listByGenre.queryOptions({ input: { genreUuid: uuid } }),
		staleTime: 30_000,
	});
	const { data: entity } = useQuery({
		...orpc.genres.getByUuid.queryOptions({ input: { uuid } }),
		staleTime: 30_000,
	});

	const total = rawBooks?.length ?? 0;
	const sortOptions: readonly SortOption<BookSortMode>[] = [
		{ value: "title", label: m["common.title"]() },
		{ value: "author", label: m["common.author"]() },
	];

	return (
		<EntityBooksView
			storageKey="nh-genre-view"
			defaultSort="title"
			sortOptions={sortOptions}
			formatFilter
			title={entity?.name ?? m["entity_page.genre_fallback"]()}
			subtitle={
				total ? m["entity_page.genre_subtitle"]({ count: total }) : undefined
			}
			isLoading={isLoading}
			rawBooks={rawBooks}
			searchAriaLabel={m["entity_page.genre_search_aria"]()}
			emptyDescription={m["entity_page.genre_empty_desc"]()}
			searchNoMatches={(query) =>
				m["entity_page.genre_no_query_matches"]({ query })
			}
		/>
	);
}
