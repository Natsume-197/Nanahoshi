import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { EntityBooksView } from "@/components/catalog/entity-books-view";
import type { SortOption } from "@/components/shared/sort-select";
import { prefetchRouteQuery } from "@/lib/prefetch-route-query";
import { m } from "@/paraglide/messages";
import type { BookSortMode } from "@/utils/filter-sort-books";
import { capitalizeFirst } from "@/utils/format";
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

		prefetchRouteQuery(
			context.queryClient,
			orpc.tags.getByUuid.queryOptions({
				input: { uuid: params.uuid },
			}),
		);
	},
});

function TagDetailPage() {
	const { uuid } = Route.useParams();

	const { data: entity } = useQuery({
		...orpc.tags.getByUuid.queryOptions({ input: { uuid } }),
		staleTime: 30_000,
	});

	const sortOptions: readonly SortOption<BookSortMode>[] = [
		{ value: "title", label: m["common.title"]() },
		{ value: "author", label: m["common.author"]() },
	];

	return (
		<EntityBooksView
			storageKey="nh-tag-view"
			defaultSort="title"
			sortOptions={sortOptions}
			formatFilter
			title={
				entity?.name
					? capitalizeFirst(entity.name)
					: m["entity_page.tag_fallback"]()
			}
			key={uuid}
			source={{ kind: "tag", uuid }}
			countLabel={(count) =>
				count ? m["entity_page.tag_subtitle"]({ count }) : undefined
			}
			searchAriaLabel={m["entity_page.tag_search_aria"]()}
			emptyDescription={m["entity_page.tag_empty_desc"]()}
			searchNoMatches={(query) =>
				m["entity_page.tag_no_query_matches"]({ query })
			}
		/>
	);
}
