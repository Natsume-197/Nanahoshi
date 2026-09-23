import { Folder, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { RailSectionTitle } from "@/components/dashboard/rail-section";
import { CollectionArtwork } from "@/components/shared/collection-card";
import { CollectionContextMenu } from "@/components/shared/collection-context-menu";
import { CreateCollectionDialog } from "@/components/shared/create-collection-button";
import {
	type ShelfBucket,
	shelfBucketMeta,
} from "@/components/shared/shelf-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAbilities } from "@/hooks/use-abilities";
import {
	resolveCollectionPreview,
	useCollectionPreviews,
} from "@/hooks/use-collection-previews";
import { useRailState } from "@/lib/rail-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/** Rail order for the reading-status shelves. Each bucket spans both formats,
 *  so rows use the neutral labels ("In progress", not "Reading") and the shelf
 *  page opens on all formats. */
const shelfBuckets: ShelfBucket[] = ["reading", "want", "backlog", "completed"];

/** Artwork-less tiles (empty shelves, every collection) share one
 *  neutral look: colour in My Space comes only from real covers. */
const neutralTileClass =
	"grid size-full place-items-center bg-sidebar-accent/60 text-nav-inactive";

type LibraryEntry = {
	key: string;
	title: string;
	subtitle: string;
	/** The reading-status shelves are system lists, always listed first. */
	system: boolean;
	active: boolean;
	artwork: ReactNode;
} & (
	| { kind: "shelf"; status: ShelfBucket }
	| { kind: "collection"; id: string; isPublic: boolean; isDynamic: boolean }
);

const focusRing =
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";

const rowClass = (active: boolean) =>
	cn(
		"flex w-full shrink-0 items-center justify-center rounded-lg py-1 transition-colors duration-150 ease-out-quart",
		// Expanded: 44px artwork in the rail's shared leading column, text on the
		// shared text column.
		"rail-expanded:justify-start rail-expanded:gap-3 rail-expanded:py-1 rail-expanded:ps-[calc(var(--rail-row-inset)+11px)] rail-expanded:pe-2",
		active
			? "rail-expanded:bg-nav-active"
			: "rail-expanded:hover:bg-sidebar-accent/40",
		// Collapsed there is no row fill, so the artwork carries the state.
		active
			? "[&>span:first-child]:ring-2 [&>span:first-child]:ring-sidebar-foreground/70 rail-expanded:[&>span:first-child]:ring-0"
			: "hover:[&>span:first-child]:opacity-80 rail-expanded:hover:[&>span:first-child]:opacity-100",
		focusRing,
	);

/** Artwork + two text lines; the text only lays out once the rail expands. */
function RowBody({
	artwork,
	title,
	subtitle,
	active = false,
	muted = false,
}: {
	artwork: ReactNode;
	title: string;
	subtitle?: string;
	active?: boolean;
	muted?: boolean;
}): ReactNode {
	return (
		<>
			<span className="rail-expanded:size-11 size-10 shrink-0 overflow-hidden rounded-lg bg-sidebar-accent/60">
				{artwork}
			</span>
			<span className="rail-expanded:flex hidden min-w-0 flex-1 flex-col gap-0.5 text-start">
				<span
					className={cn(
						"truncate text-[15px] leading-tight",
						active
							? "font-semibold text-sidebar-foreground"
							: muted
								? "font-medium text-nav-inactive"
								: "font-medium text-sidebar-foreground/90",
					)}
				>
					{title}
				</span>
				{subtitle && (
					<span className="truncate text-[13px] text-nav-inactive leading-tight">
						{subtitle}
					</span>
				)}
			</span>
		</>
	);
}

/** Collapsed, the rail only shows artwork, so name and subtitle move into a
 *  tooltip. Expanded, the row already says it all. */
function CollapsedTooltip({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: ReactNode;
}): ReactNode {
	const collapsed = useRailState() === "collapsed";
	if (!collapsed) return children;
	return (
		<Tooltip>
			<TooltipTrigger render={<div className="w-full" />}>
				{children}
			</TooltipTrigger>
			<TooltipContent side="right" sideOffset={8}>
				<span className="block font-medium">{title}</span>
				{subtitle && <span className="block opacity-70">{subtitle}</span>}
			</TooltipContent>
		</Tooltip>
	);
}

function EntryRow({
	entry,
	empty,
}: {
	entry: LibraryEntry;
	empty: boolean;
}): ReactNode {
	const body = (
		<RowBody
			artwork={entry.artwork}
			title={entry.title}
			subtitle={entry.subtitle}
			active={entry.active}
			muted={empty}
		/>
	);
	const shared = {
		preload: "intent" as const,
		"aria-current": entry.active ? ("page" as const) : undefined,
		className: rowClass(entry.active),
	};

	let row: ReactNode;
	switch (entry.kind) {
		case "shelf":
			row = (
				<Link
					to="/dashboard/shelves/$status"
					params={{ status: entry.status }}
					search={{ mediaType: "all" }}
					{...shared}
				>
					{body}
				</Link>
			);
			break;
		case "collection":
			row = (
				<CollectionContextMenu
					collectionId={entry.id}
					collectionName={entry.title}
					isPublic={entry.isPublic}
					isDynamic={entry.isDynamic}
				>
					<Link
						to="/dashboard/collections/$collectionId"
						params={{ collectionId: entry.id }}
						{...shared}
					>
						{body}
					</Link>
				</CollectionContextMenu>
			);
			break;
	}

	return (
		<CollapsedTooltip title={entry.title} subtitle={entry.subtitle}>
			{row}
		</CollapsedTooltip>
	);
}

function SkeletonRow(): ReactNode {
	return (
		<div
			aria-hidden="true"
			className="flex w-full shrink-0 items-center rail-expanded:justify-start justify-center rail-expanded:gap-3 py-1 rail-expanded:py-1 rail-expanded:ps-[calc(var(--rail-row-inset)+11px)] rail-expanded:pe-2"
		>
			<Skeleton className="rail-expanded:size-11 size-10 shrink-0 rounded-lg" />
			<span className="rail-expanded:flex hidden min-w-0 flex-1 flex-col gap-1.5">
				<Skeleton className="h-3 w-3/4 rounded" />
				<Skeleton className="h-2.5 w-1/2 rounded" />
			</span>
		</div>
	);
}

/** Artwork slot for the rail's own actions: dashed, so it never reads as a
 *  list someone made. */
function ActionArtwork({ children }: { children: ReactNode }): ReactNode {
	return (
		<span className="grid size-full place-items-center rounded-lg border border-sidebar-border border-dashed bg-sidebar text-nav-inactive">
			{children}
		</span>
	);
}

/**
 * The user's own lists, Spotify "Your Library" style: the four
 * reading-status shelves and their collections as artwork rows. It shares the
 * rail's surface, heading style, row states and scroll rather than framing
 * itself: it is just the rail's last group. Collapsed, only the artwork
 * stays, with the names in tooltips.
 */
export function MyLibrarySection({
	locationPathname,
}: {
	locationPathname: string;
}): ReactNode {
	const { can, isLoading: abilitiesLoading } = useAbilities();
	const canReadCollections = !abilitiesLoading && can("collection", "read");
	const canCreateCollections = !abilitiesLoading && can("collection", "create");
	const [createOpen, setCreateOpen] = useState(false);

	const { data: summaries, isLoading: summariesLoading } = useQuery({
		...orpc.shelves.summaries.queryOptions(),
		staleTime: 30_000,
	});
	const { data: collections, isLoading: collectionsLoading } = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
		enabled: canReadCollections,
	});
	// Dynamic collections resolve their count and covers from rules, so they
	// need the batched preview; manual ones carry both on the summary.
	const previews = useCollectionPreviews(
		(collections ?? [])
			.filter(
				(collection) =>
					collection.kind === "dynamic" || collection.bookCount == null,
			)
			.map((collection) => collection.id),
		canReadCollections && !collectionsLoading,
	);

	const itemCount = (count: number | null | undefined) =>
		count == null
			? "…"
			: count === 0
				? m["nav.empty"]()
				: m["media.item_count"]({ count });
	const summaryByBucket = new Map(
		summaries?.map((summary) => [summary.status, summary]),
	);
	/** Counts known to be zero; unknown ("…") never dims a row. */
	const emptyKeys = new Set<string>();

	const shelfEntries = shelfBuckets.map((status): LibraryEntry => {
		const { icon: Icon, label } = shelfBucketMeta(status, "all");
		const count = summaryByBucket.get(status)?.count ?? 0;
		if (count === 0) emptyKeys.add(`shelf-${status}`);
		return {
			kind: "shelf",
			status,
			key: `shelf-${status}`,
			title: label(),
			subtitle: itemCount(count),
			system: true,
			active: locationPathname.startsWith(`/dashboard/shelves/${status}`),
			artwork: (
				<CollectionArtwork
					covers={summaryByBucket.get(status)?.previewCovers}
					fallback={
						<span className={neutralTileClass}>
							<Icon weight="fill" className="size-5" />
						</span>
					}
				/>
			),
		};
	});
	const collectionEntries = [...(collections ?? [])]
		// Most recently changed first.
		.sort(
			(a, b) =>
				new Date(b.updatedAt ?? 0).getTime() -
				new Date(a.updatedAt ?? 0).getTime(),
		)
		.map((collection): LibraryEntry => {
			const { count, previewCovers } = resolveCollectionPreview(
				collection,
				previews.byId.get(collection.id),
			);
			if (count === 0) emptyKeys.add(`collection-${collection.id}`);
			return {
				kind: "collection",
				id: collection.id,
				isPublic: collection.isPublic,
				isDynamic: collection.kind === "dynamic",
				key: `collection-${collection.id}`,
				title: collection.name,
				subtitle: itemCount(count),
				system: false,
				active: locationPathname.startsWith(
					`/dashboard/collections/${collection.id}`,
				),
				// Same artwork as the shelves: latest covers, or the neutral folder
				// tile while the collection is empty.
				artwork: (
					<CollectionArtwork
						covers={previewCovers}
						fallback={
							<span className={neutralTileClass}>
								<Folder weight="fill" className="size-5" />
							</span>
						}
					/>
				),
			};
		});

	// One list: the reading-status shelves are just collections the
	// app keeps for you, listed ahead of the ones you made.
	const entries = [...shelfEntries, ...collectionEntries];
	const loadingSystem = summariesLoading;
	const loadingCollections =
		abilitiesLoading || (canReadCollections && collectionsLoading);
	// A brand-new library gets one nudge instead of an empty tail.
	const showFirstCollection =
		canCreateCollections &&
		!collectionsLoading &&
		collectionEntries.length === 0;
	const firstCollectionLabel = m["nav.first_collection"]();

	return (
		<section
			aria-label={m["nav.my_library"]()}
			className="flex w-full shrink-0 flex-col"
		>
			{/* Collapsed there is no title, so a gap alone separates the
			    destinations from the artwork below. */}
			<span aria-hidden="true" className="rail-expanded:hidden h-3 shrink-0" />

			<RailSectionTitle
				label={m["nav.my_library"]()}
				to="/dashboard/collections"
			/>

			<div className="flex w-full flex-col items-center gap-0.5">
				{/* The four shelves. */}
				{loadingSystem &&
					[0, 1, 2, 3].map((index) => (
						<SkeletonRow key={`skeleton-system-${index}`} />
					))}
				{entries
					.filter((entry) => !(loadingSystem && entry.system))
					.map((entry) => (
						<EntryRow
							key={entry.key}
							entry={entry}
							empty={emptyKeys.has(entry.key)}
						/>
					))}
				{loadingCollections &&
					[0, 1, 2].map((index) => (
						<SkeletonRow key={`skeleton-collection-${index}`} />
					))}

				{showFirstCollection && (
					<CollapsedTooltip title={firstCollectionLabel}>
						<button
							type="button"
							onClick={() => setCreateOpen(true)}
							className={rowClass(false)}
						>
							<RowBody
								artwork={
									<ActionArtwork>
										<Plus weight="bold" className="size-4" />
									</ActionArtwork>
								}
								title={firstCollectionLabel}
								muted
							/>
						</button>
					</CollapsedTooltip>
				)}
			</div>

			{canCreateCollections && (
				<CreateCollectionDialog
					open={createOpen}
					onOpenChange={setCreateOpen}
				/>
			)}
		</section>
	);
}
