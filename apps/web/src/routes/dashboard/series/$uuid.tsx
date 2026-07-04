import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Download, Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditEntityDialog } from "@/components/catalog/edit-entity-dialog";
import { EntityBooksView } from "@/components/catalog/entity-books-view";
import type { SortOption } from "@/components/shared/sort-select";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import type { BookSortMode } from "@/utils/filter-sort-books";
import { formatAvgRating, getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/series/$uuid")({
	component: SeriesDetailPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: ({ context, params }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(
			orpc.books.listBySeries.queryOptions({
				input: { seriesUuid: params.uuid },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.series.getByUuid.queryOptions({
				input: { uuid: params.uuid },
			}),
		);
	},
});

function SeriesDetailPage() {
	const { uuid } = Route.useParams();
	const { can } = useAbilities();
	const [isDownloading, setIsDownloading] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const canEdit = can("book", "editMetadata");

	const { data: rawBooks, isLoading } = useQuery({
		...orpc.books.listBySeries.queryOptions({ input: { seriesUuid: uuid } }),
		staleTime: 30_000,
	});
	const { data: entity } = useQuery({
		...orpc.series.getByUuid.queryOptions({ input: { uuid } }),
		staleTime: 30_000,
	});
	const { data: ratingStats } = useQuery({
		...orpc.series.ratingStats.queryOptions({ input: { uuid } }),
		staleTime: 60_000,
	});

	const renameMutation = useMutation({
		...orpc.series.rename.mutationOptions(),
		onSuccess: () => {
			setEditOpen(false);
			toast.success(m["entity_page.series_updated"]());
			queryClient.invalidateQueries();
		},
		onError: (err) =>
			toast.error(
				getErrorMessage(err, m["entity_page.series_update_failed"]()),
			),
	});

	const handleDownloadSeries = async () => {
		if (isDownloading) return;
		try {
			setIsDownloading(true);
			const { url } = await client.files.getSeriesDownloadUrl({
				seriesUuid: uuid,
			});
			window.open(url, "_blank", "noopener,noreferrer");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: m["entity_page.series_download_failed"](),
			);
		} finally {
			setIsDownloading(false);
		}
	};

	const total = rawBooks?.length ?? 0;
	const sortOptions: readonly SortOption<BookSortMode>[] = [
		{ value: "position", label: m["entity_page.sort_series_order"]() },
		{ value: "title", label: m["common.title"]() },
		{ value: "author", label: m["common.author"]() },
	];
	const subtitle =
		[
			total ? m["entity_page.series_subtitle"]({ count: total }) : null,
			formatAvgRating(ratingStats?.average),
		]
			.filter(Boolean)
			.join("  ·  ") || undefined;

	return (
		<EntityBooksView
			storageKey="nh-series-detail-view"
			defaultSort="position"
			sortOptions={sortOptions}
			title={entity?.name ?? m["entity_page.series_fallback"]()}
			subtitle={subtitle}
			isLoading={isLoading}
			rawBooks={rawBooks}
			searchAriaLabel={m["entity_page.series_search_aria"]()}
			emptyDescription={m["entity_page.series_empty_desc"]()}
			searchNoMatches={(query) =>
				m["entity_page.series_no_query_matches"]({ query })
			}
			extraActions={
				<>
					{canEdit && entity && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setEditOpen(true)}
						>
							<Pencil className="mr-1.5 size-4" />
							{m["entity_page.edit"]()}
						</Button>
					)}
					{total > 0 && can("book", "download") && (
						<Button
							variant="outline"
							size="sm"
							onClick={handleDownloadSeries}
							disabled={isDownloading}
						>
							{isDownloading ? (
								<Loader2 className="mr-1.5 size-4 animate-spin" />
							) : (
								<Download className="mr-1.5 size-4" />
							)}
							{m["entity_page.series_download"]()}
						</Button>
					)}
				</>
			}
		>
			{entity && (
				<EditEntityDialog
					open={editOpen}
					onOpenChange={setEditOpen}
					title={m["entity_page.series_edit_title"]()}
					initialName={entity.name}
					initialDescription={entity.description ?? ""}
					isPending={renameMutation.isPending}
					onSubmit={(values) =>
						renameMutation.mutate({
							uuid,
							name: values.name,
							description: values.description,
						})
					}
				/>
			)}
		</EntityBooksView>
	);
}
