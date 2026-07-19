import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
	ArrowsClockwise,
	BookOpen,
	Books,
	CircleNotch,
	GearSix,
	Headphones,
	Plus,
	Shuffle,
	Trash,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, type LinkProps, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { client, orpc } from "@/utils/orpc";

export const librariesOverviewQueryOptions = () => ({
	...orpc.libraries.getLibrariesOverview.queryOptions(),
	staleTime: 30_000,
});

// Front-to-back fan for the tile's recent covers; the first (most recent)
// cover sits on top, bleeding slightly past the tile's right edge. Square
// audiobook covers are wider, so only two fit before the fan crowds the text.
const BOOK_FAN_POSITIONS = [
	"-right-2 top-3 rotate-[9deg]",
	"right-9 top-5 rotate-[-3deg]",
	"right-[4.75rem] top-7 rotate-[-12deg]",
];
const SQUARE_FAN_POSITIONS = [
	"-right-2 top-5 rotate-[8deg]",
	"right-14 top-7 rotate-[-8deg]",
];

function CoverFan({ covers, square }: { covers: string[]; square?: boolean }) {
	const positions = square ? SQUARE_FAN_POSITIONS : BOOK_FAN_POSITIONS;
	const files = covers
		.map((cover) => getCoverFilename(cover))
		.filter((cover): cover is string => !!cover)
		.slice(0, positions.length);
	if (files.length === 0) return null;
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-y-0 right-0 w-40"
		>
			{files.map((file, index) => (
				<img
					key={file}
					src={getCoverPresetUrl(file, coverPresets.thumbnail)}
					alt=""
					loading="lazy"
					decoding="async"
					className={cn(
						"absolute rounded-md object-cover shadow-lg ring-1 ring-foreground/10",
						square ? "size-20" : "aspect-[2/3] w-16",
						positions[index],
					)}
					style={{ zIndex: 3 - index }}
				/>
			))}
		</div>
	);
}

function CategoryTile({
	link,
	title,
	subtitle,
	icon: Icon,
	covers,
	square,
	highlight,
}: {
	link: Pick<LinkProps, "to" | "params" | "search">;
	title: string;
	subtitle: string;
	icon: PhosphorIcon;
	covers: string[];
	square?: boolean;
	highlight?: boolean;
}) {
	const hasCovers = covers.some((cover) => getCoverFilename(cover));
	return (
		<Link
			{...link}
			preload="intent"
			className={cn(
				"group relative flex h-32 overflow-hidden rounded-xl border border-card-border/60 p-4 transition-colors",
				highlight
					? "bg-surface-accent hover:bg-surface-accent-hover focus-visible:bg-surface-accent-hover active:bg-surface-accent-hover"
					: "bg-surface-card hover:bg-surface-card-hover focus-visible:bg-surface-card-hover active:bg-surface-card-hover",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
			)}
		>
			{hasCovers ? (
				<CoverFan covers={covers} square={square} />
			) : (
				// Coverless libraries get a quiet watermark so the tile still has a
				// bottom-right visual anchor, matching the fan's placement.
				<Icon
					aria-hidden
					weight="fill"
					className="pointer-events-none absolute -right-3 -bottom-5 size-24 rotate-[-10deg] text-foreground/[0.05]"
				/>
			)}
			<div
				className={cn(
					"relative z-10 flex min-w-0 flex-1 flex-col",
					hasCovers && "pr-24",
				)}
			>
				<p className="mt-auto truncate font-bold text-lg leading-snug">
					{title}
				</p>
				<p className="truncate text-muted-foreground text-sm tabular-nums">
					{subtitle}
				</p>
			</div>
		</Link>
	);
}

// Action tile, not a link: picks a random title (weighted by format size)
// and jumps straight to its detail page.
function SurpriseTile({
	ebookCount,
	audiobookCount,
}: {
	ebookCount: number;
	audiobookCount: number;
}) {
	const navigate = useNavigate();
	const [isShuffling, setIsShuffling] = useState(false);

	const handleSurprise = () => {
		if (isShuffling) return;
		setIsShuffling(true);
		const total = ebookCount + audiobookCount;
		const pickAudiobook = Math.random() * total < audiobookCount;
		const request = pickAudiobook
			? client.audiobooks
					.listRandom({ limit: 1 })
					.then(
						(books) =>
							books[0] && { format: "audiobook" as const, uuid: books[0].uuid },
					)
			: client.books
					.listRandom({ limit: 1 })
					.then(
						(books) =>
							books[0] && { format: "ebook" as const, uuid: books[0].uuid },
					);
		request
			.then((pick) => {
				if (!pick) return;
				return navigate(
					pick.format === "audiobook"
						? { to: "/dashboard/audiobooks/$uuid", params: { uuid: pick.uuid } }
						: { to: "/dashboard/books/$uuid", params: { uuid: pick.uuid } },
				);
			})
			.catch((err: unknown) =>
				toast.error(err instanceof Error ? err.message : String(err)),
			)
			.finally(() => setIsShuffling(false));
	};

	return (
		<button
			type="button"
			onClick={handleSurprise}
			disabled={isShuffling}
			aria-busy={isShuffling}
			className={cn(
				"group relative flex h-32 cursor-pointer overflow-hidden rounded-xl border border-card-border/60 p-4 text-left transition-colors",
				"bg-surface-card hover:bg-surface-card-hover focus-visible:bg-surface-card-hover active:bg-surface-card-hover",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
				"disabled:cursor-wait",
			)}
		>
			<Shuffle
				aria-hidden
				weight="fill"
				className="pointer-events-none absolute -right-3 -bottom-5 size-24 rotate-[-10deg] text-foreground/[0.05]"
			/>
			<div className="relative z-10 flex min-w-0 flex-1 flex-col">
				<p className="mt-auto flex items-center gap-2 truncate font-bold text-lg leading-snug">
					{isShuffling && (
						<CircleNotch aria-hidden className="size-4 shrink-0 animate-spin" />
					)}
					{m["explore.surprise_me"]()}
				</p>
				<p className="truncate text-muted-foreground text-sm">
					{m["explore.surprise_me_desc"]()}
				</p>
			</div>
		</button>
	);
}

type LibraryOverview = {
	uuid: string;
	name: string | null;
	mediaType: "ebook" | "audiobook";
	bookCount: number;
	previewCovers: string[];
};

export function ExploreView() {
	const { openOrgSettings } = useSettingsModal();
	const { can } = useAbilities();
	const canManageLibraries = can("library", "create");
	const queryClient = useQueryClient();
	const [deleteTarget, setDeleteTarget] = useState<{
		uuid: string;
		name: string;
	} | null>(null);

	const overview = useQuery(librariesOverviewQueryOptions());

	const scanMutation = useMutation({
		...orpc.libraries.scanLibrary.mutationOptions(),
		onSuccess: () => toast.success(m["toast.library_scan_started"]()),
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = useMutation({
		...orpc.libraries.deleteLibrary.mutationOptions(),
		onSuccess: () => {
			// Deleting a library cascade-deletes books/series/authors/progress —
			// stale book queries would keep showing them, so flush every cache
			queryClient.invalidateQueries();
			setDeleteTarget(null);
			toast.success(m["toast.library_deleted"]());
		},
		onError: (err) => toast.error(err.message),
	});

	const libraries: LibraryOverview[] = overview.data ?? [];
	const ebookCount = libraries
		.filter((l) => l.mediaType === "ebook")
		.reduce((sum, l) => sum + l.bookCount, 0);
	const audiobookCount = libraries
		.filter((l) => l.mediaType === "audiobook")
		.reduce((sum, l) => sum + l.bookCount, 0);
	const coversFor = (mediaType: LibraryOverview["mediaType"]) =>
		libraries
			.filter((l) => l.mediaType === mediaType)
			.flatMap((l) => l.previewCovers)
			.slice(0, 3);
	const hasEbooks = libraries.some((l) => l.mediaType === "ebook");
	const hasAudiobooks = libraries.some((l) => l.mediaType === "audiobook");

	const openLibrarySettings = () => openOrgSettings("libraries");

	const libraryTile = (lib: LibraryOverview) => {
		const isAudiobook = lib.mediaType === "audiobook";
		const tile = (
			<CategoryTile
				link={{
					to: "/dashboard/libraries/$uuid",
					params: { uuid: lib.uuid },
				}}
				title={lib.name ?? m["library.untitled"]()}
				subtitle={
					isAudiobook
						? m["media.audiobook_count"]({ count: lib.bookCount })
						: m["media.book_count"]({ count: lib.bookCount })
				}
				icon={isAudiobook ? Headphones : BookOpen}
				covers={lib.previewCovers}
				square={isAudiobook}
			/>
		);
		return (
			<ContextMenu key={lib.uuid}>
				<ContextMenuTrigger asChild>{tile}</ContextMenuTrigger>
				<ContextMenuContent className="w-44">
					<ContextMenuItem onClick={openLibrarySettings}>
						<GearSix />
						{m["nav.settings"]()}
					</ContextMenuItem>
					{canManageLibraries && (
						<>
							<ContextMenuItem
								onClick={() => scanMutation.mutate({ libraryUuid: lib.uuid })}
							>
								<ArrowsClockwise />
								{m["library.scan_now"]()}
							</ContextMenuItem>
							<ContextMenuSeparator />
							<ContextMenuItem
								variant="destructive"
								onClick={() =>
									setDeleteTarget({
										uuid: lib.uuid,
										name: lib.name ?? m["library.untitled"](),
									})
								}
							>
								<Trash />
								{m["common.delete"]()}
							</ContextMenuItem>
						</>
					)}
				</ContextMenuContent>
			</ContextMenu>
		);
	};

	let content: ReactNode;
	if (overview.isLoading) {
		content = (
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
				{["a", "b", "c", "d"].map((key) => (
					<Skeleton
						key={key}
						variant="surface"
						className="h-32 rounded-xl border border-card-border/60"
					/>
				))}
			</div>
		);
	} else if (libraries.length === 0) {
		content = (
			<div className="flex flex-col items-center gap-4 py-24 text-center">
				<Books className="size-12 text-muted-foreground/40" weight="light" />
				<p className="max-w-sm text-muted-foreground text-sm">
					{m["explore.empty"]()}
				</p>
				{canManageLibraries && (
					<Button onClick={openLibrarySettings}>
						<Plus data-icon="inline-start" />
						{m["library.add_library"]()}
					</Button>
				)}
			</div>
		);
	} else {
		content = (
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
				{hasEbooks && (
					<CategoryTile
						link={{ to: "/dashboard/books", search: { format: "ebook" } }}
						title={m["explore.all_books"]()}
						subtitle={m["media.book_count"]({ count: ebookCount })}
						icon={Books}
						covers={coversFor("ebook")}
						highlight
					/>
				)}
				{hasAudiobooks && (
					<CategoryTile
						link={{ to: "/dashboard/books", search: { format: "audiobook" } }}
						title={m["explore.all_audiobooks"]()}
						subtitle={m["media.audiobook_count"]({ count: audiobookCount })}
						icon={Headphones}
						covers={coversFor("audiobook")}
						square
						highlight
					/>
				)}
				{ebookCount + audiobookCount > 0 && (
					<SurpriseTile
						ebookCount={ebookCount}
						audiobookCount={audiobookCount}
					/>
				)}
				{libraries.map(libraryTile)}
				{canManageLibraries && (
					<button
						type="button"
						onClick={openLibrarySettings}
						className="flex h-32 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/60 border-dashed text-muted-foreground text-sm transition-colors hover:bg-card/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
					>
						<Plus className="size-5" />
						{m["library.add_library"]()}
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="px-4 pt-4 pb-8 md:px-6 md:pt-8 lg:px-8">
			<h1 className="mb-6 font-bold text-3xl tracking-tight md:text-4xl">
				{m["nav.browse"]()}
			</h1>
			{content}

			<Modal
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
				title={m["library.delete_title"]()}
				description={m["library.delete_desc"]({
					name: deleteTarget?.name ?? "",
				})}
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							disabled={deleteMutation.isPending}
							onClick={() => setDeleteTarget(null)}
						>
							{m["common.cancel"]()}
						</Button>
						<Button
							type="button"
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (deleteTarget)
									deleteMutation.mutate({ uuid: deleteTarget.uuid });
							}}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleteMutation.isPending && (
								<CircleNotch
									className="animate-spin"
									data-icon="inline-start"
								/>
							)}
							{m["common.delete"]()}
						</Button>
					</>
				}
			/>
		</div>
	);
}
