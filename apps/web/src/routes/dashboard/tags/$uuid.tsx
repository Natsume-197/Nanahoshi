import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { EntityBooksView } from "@/components/catalog/entity-books-view";
import type { SortOption } from "@/components/shared/sort-select";
import { m } from "@/paraglide/messages";
import type { BookSortMode } from "@/utils/filter-sort-books";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/tags/$uuid")({
	component: TagDetailPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: ({ context, params }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(
			orpc.books.listByTag.queryOptions({
				input: { tagUuid: params.uuid },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.tags.getByUuid.queryOptions({
				input: { uuid: params.uuid },
			}),
		);
	},
});

function TagDetailPage() {
	const { uuid } = Route.useParams();

	const { data: rawBooks, isLoading } = useQuery({
		...orpc.books.listByTag.queryOptions({ input: { tagUuid: uuid } }),
		staleTime: 30_000,
	});
	const { data: entity } = useQuery({
		...orpc.tags.getByUuid.queryOptions({ input: { uuid } }),
		staleTime: 30_000,
	});

	const total = rawBooks?.length ?? 0;
	const sortOptions: readonly SortOption<BookSortMode>[] = [
		{ value: "title", label: m["common.title"]() },
		{ value: "author", label: m["common.author"]() },
	];

	return (
		<EntityBooksView
			storageKey="nh-tag-view"
			defaultSort="title"
			sortOptions={sortOptions}
			title={entity?.name ?? m["entity_page.tag_fallback"]()}
			subtitle={
				total ? m["entity_page.tag_subtitle"]({ count: total }) : undefined
			}
			isLoading={isLoading}
			rawBooks={rawBooks}
			searchAriaLabel={m["entity_page.tag_search_aria"]()}
			emptyDescription={m["entity_page.tag_empty_desc"]()}
			searchNoMatches={(query) =>
				m["entity_page.tag_no_query_matches"]({ query })
			}
		/>
	);
}
