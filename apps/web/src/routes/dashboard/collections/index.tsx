import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	CollectionListItem,
	CollectionListItemSkeleton,
} from "@/components/shared/collection-card";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { CreateCollectionButton } from "@/components/shared/create-collection-button";
import { EmptyState } from "@/components/shared/empty-state";
import { ShelfListItem } from "@/components/shared/shelf-card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbilities } from "@/hooks/use-abilities";
import {
	resolveCollectionPreview,
	useCollectionPreviews,
} from "@/hooks/use-collection-previews";
import { collectionMatchesFormat } from "@/lib/library-format";
import { PAGE_SHELL } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

const SKELETON_KEYS = Array.from(
	{ length: 6 },
	(_, i) => `collection-skeleton-${i}`,
);

export const Route = createFileRoute("/dashboard/collections/")({
	component: CollectionsPage,
});

function CollectionsPage() {
	const { can, isLoading: abilitiesLoading } = useAbilities();
	const canRead = can("collection", "read");

	const { data: collections, isLoading } = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: canRead,
	});

	// Reading-status "system lists" (want/reading/backlog/completed), pinned ahead
	// of custom collections.
	const { data: shelfSummaries, isLoading: shelvesLoading } = useQuery({
		...orpc.shelves.summaries.queryOptions(),
		staleTime: 30_000,
		enabled: canRead,
	});

	const pageLoading = isLoading || shelvesLoading;
	const collectionIds =
		collections
			?.filter(
				(collection) =>
					collection.kind === "dynamic" || collection.bookCount == null,
			)
			.map((collection) => collection.id) ?? [];
	const previews = useCollectionPreviews(collectionIds, canRead && !isLoading);
	const matchesFormat = (
		item: NonNullable<typeof collections>[number],
		mediaType: "ebook" | "audiobook",
	) => {
		const preview = resolveCollectionPreview(item, previews.byId.get(item.id));
		return collectionMatchesFormat(
			{
				ebookCount: preview.ebookCount ?? null,
				audiobookCount: preview.audiobookCount ?? null,
			},
			mediaType,
		);
	};
	const ebookCollections =
		collections?.filter((item) => matchesFormat(item, "ebook")) ?? [];
	const audiobookCollections =
		collections?.filter((item) => matchesFormat(item, "audiobook")) ?? [];

	const renderLists = (mediaType: "ebook" | "audiobook") => {
		const isAudiobook = mediaType === "audiobook";
		const visibleCollections = isAudiobook
			? audiobookCollections
			: ebookCollections;

		return (
			<div className="space-y-6">
				<section
					aria-label={
						isAudiobook
							? m["collection.listening_lists"]()
							: m["collection.reading_lists"]()
					}
				>
					<ul className="flex flex-col gap-1">
						{shelfSummaries?.map((shelf) => {
							const count = isAudiobook
								? (shelf.audiobookCount ?? 0)
								: (shelf.ebookCount ?? shelf.count ?? 0);
							const previewCovers = isAudiobook
								? (shelf.audiobookPreviewCovers ?? [])
								: (shelf.ebookPreviewCovers ?? shelf.previewCovers ?? []);

							return (
								<li key={shelf.status}>
									<ShelfListItem
										status={shelf.status}
										previewCovers={previewCovers}
										subtitle={m["media.item_count"]({ count })}
										mediaType={mediaType}
									/>
								</li>
							);
						})}
					</ul>
				</section>

				<Separator />

				<section aria-label={m["collection.your_collections"]()}>
					{visibleCollections.length > 0 ? (
						<ul className="flex flex-col gap-1">
							{visibleCollections.map((item) => {
								const preview = resolveCollectionPreview(
									item,
									previews.byId.get(item.id),
								);
								const count = isAudiobook
									? (preview.audiobookCount ?? 0)
									: (preview.ebookCount ?? 0);
								const previewCovers = isAudiobook
									? preview.audiobookPreviewCovers
									: preview.ebookPreviewCovers;

								return (
									<li key={item.id}>
										<CollectionListItem
											id={item.id}
											name={item.name}
											previewCovers={previewCovers}
											subtitle={m["media.item_count"]({ count })}
											isPublic={item.isPublic}
											isDynamic={item.kind === "dynamic"}
										/>
									</li>
								);
							})}
						</ul>
					) : (
						<div className="rounded-xl bg-muted/60 px-5 py-8 sm:px-6">
							<h3 className="font-medium text-base">
								{isAudiobook
									? m["collection.no_audiobook_collections_title"]()
									: m["collection.no_book_collections_title"]()}
							</h3>
							<p className="mt-1 max-w-xl text-pretty text-muted-foreground text-sm leading-relaxed">
								{isAudiobook
									? m["collection.no_audiobook_collections_desc"]()
									: m["collection.no_book_collections_desc"]()}
							</p>
							<div className="mt-4 hidden md:block">
								<CreateCollectionButton />
							</div>
						</div>
					)}
				</section>
			</div>
		);
	};

	if (!abilitiesLoading && !canRead) {
		return (
			<div className={PAGE_SHELL}>
				<EmptyState
					title={m["collection.unavailable_title"]()}
					description={m["collection.unavailable_desc"]()}
				/>
			</div>
		);
	}

	return (
		<div className={cn(PAGE_SHELL, "space-y-6")}>
			<CollectionToolbar
				title={m["nav.collections"]()}
				actions={
					pageLoading ? undefined : (
						<CreateCollectionButton className="hidden md:inline-flex" />
					)
				}
			/>

			{pageLoading && (
				<ul className="flex flex-col gap-1">
					{SKELETON_KEYS.map((key) => (
						<li key={key}>
							<CollectionListItemSkeleton />
						</li>
					))}
				</ul>
			)}

			{!pageLoading && (
				<>
					<Tabs defaultValue="ebooks" className="gap-5">
						<TabsList
							variant="line"
							className="grid min-h-11 w-full grid-cols-2 p-0 sm:flex sm:w-fit"
						>
							<TabsTrigger
								value="ebooks"
								className="min-h-11 min-w-0 whitespace-normal px-3 text-center leading-tight sm:flex-none sm:px-4"
							>
								{m["collection.book_lists"]()}
							</TabsTrigger>
							<TabsTrigger
								value="audiobooks"
								className="min-h-11 min-w-0 whitespace-normal px-3 text-center leading-tight sm:flex-none sm:px-4"
							>
								{m["collection.audiobook_lists"]()}
							</TabsTrigger>
						</TabsList>
						<TabsContent value="ebooks">{renderLists("ebook")}</TabsContent>
						<TabsContent value="audiobooks">
							{renderLists("audiobook")}
						</TabsContent>
					</Tabs>

					<CreateCollectionButton
						iconOnly
						className="fixed right-[max(1rem,var(--safe-area-right))] bottom-[calc(var(--mobile-tabbar-height)+var(--mobile-player-offset)+var(--safe-area-bottom)+1rem)] z-20 size-12 shadow-lg md:hidden"
					/>
				</>
			)}
		</div>
	);
}
