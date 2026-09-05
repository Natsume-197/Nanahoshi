import { Pencil } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { EditEntityDialog } from "@/components/catalog/edit-entity-dialog";
import { EntityBooksView } from "@/components/catalog/entity-books-view";
import type { SortOption } from "@/components/shared/sort-select";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { prefetchRouteQuery } from "@/lib/prefetch-route-query";
import { m } from "@/paraglide/messages";
import type { BookSortMode } from "@/utils/filter-sort-books";
import { getErrorMessage } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/publishers/$uuid")({
	component: PublisherDetailPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: ({ context, params }) => {
		if (typeof window === "undefined") return;

		prefetchRouteQuery(
			context.queryClient,
			orpc.publishers.getByUuid.queryOptions({
				input: { uuid: params.uuid },
			}),
		);
	},
});

function PublisherDetailPage() {
	const { uuid } = Route.useParams();
	const { can } = useAbilities();
	const [editOpen, setEditOpen] = useState(false);
	const canEdit = can("book", "editMetadata");

	const { data: entity } = useQuery({
		...orpc.publishers.getByUuid.queryOptions({ input: { uuid } }),
		staleTime: 30_000,
	});

	const updateMutation = useMutation({
		...orpc.publishers.update.mutationOptions(),
		onSuccess: () => {
			setEditOpen(false);
			toast.success(m["entity_page.publisher_updated"]());
			queryClient.invalidateQueries();
		},
		onError: (err) =>
			toast.error(
				getErrorMessage(err, m["entity_page.publisher_update_failed"]()),
			),
	});

	const sortOptions: readonly SortOption<BookSortMode>[] = [
		{ value: "title", label: m["common.title"]() },
		{ value: "author", label: m["common.author"]() },
	];

	return (
		<EntityBooksView
			storageKey="nh-publisher-view"
			defaultSort="title"
			sortOptions={sortOptions}
			title={entity?.name ?? m["entity_page.publisher_fallback"]()}
			key={uuid}
			source={{ kind: "publisher", uuid }}
			countLabel={(count) =>
				count ? m["entity_page.publisher_subtitle"]({ count }) : undefined
			}
			searchAriaLabel={m["entity_page.publisher_search_aria"]()}
			emptyDescription={m["entity_page.publisher_empty_desc"]()}
			searchNoMatches={(query) =>
				m["entity_page.publisher_no_query_matches"]({ query })
			}
			extraActions={
				canEdit && entity ? (
					<Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
						<Pencil className="mr-1.5 size-4" />
						{m["entity_page.edit"]()}
					</Button>
				) : undefined
			}
		>
			{entity && (
				<EditEntityDialog
					open={editOpen}
					onOpenChange={setEditOpen}
					title={m["entity_page.publisher_edit_title"]()}
					initialName={entity.name}
					isPending={updateMutation.isPending}
					onSubmit={(values) =>
						updateMutation.mutate({ uuid, name: values.name })
					}
				/>
			)}
		</EntityBooksView>
	);
}
