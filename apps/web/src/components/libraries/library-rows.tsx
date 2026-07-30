import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
import {
	ArrowsClockwise,
	BookOpen,
	DotsThree,
	FolderOpen,
	Headphones,
	PencilSimple,
	Trash,
	UploadSimple,
	WarningCircle,
} from "@phosphor-icons/react";
import {
	LibraryTaskProgress,
	useLibraryTasks,
} from "@/components/libraries/library-task-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatRelativeTime } from "@/utils/format";

export type LibraryRowItem = {
	id: number;
	uuid: string;
	name: string;
	mediaType: "ebook" | "audiobook";
	/** null while the overview query is still loading. */
	bookCount: number | null;
	pathCount: number;
	hasEnabledPath: boolean;
	unreachablePathCount: number;
	lastScannedAt: string | null;
	previewCovers: string[];
};

export function LibraryRows({
	items,
	isLoading,
	canScan,
	canUpload,
	canDelete,
	onOpen,
	onScan,
	onUpload,
	onDelete,
}: {
	items: LibraryRowItem[];
	isLoading: boolean;
	canScan: boolean;
	canUpload: boolean;
	canDelete: boolean;
	onOpen: (item: LibraryRowItem, intent?: "folders" | "rename") => void;
	onScan: (item: LibraryRowItem) => void;
	onUpload: (item: LibraryRowItem) => void;
	onDelete: (item: LibraryRowItem) => void;
}) {
	const busyByLibrary = useLibraryTasks();

	if (isLoading) {
		return (
			<ul className="flex flex-col">
				{[0, 1, 2].map((key) => (
					<li key={key} className="flex items-center gap-4 py-4">
						<Skeleton className="size-12 rounded-lg" />
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-3 w-64" />
						</div>
					</li>
				))}
			</ul>
		);
	}

	return (
		<ul className="flex flex-col">
			{items.map((item, index) => (
				<li key={item.uuid}>
					<LibraryRow
						item={item}
						busy={busyByLibrary.get(item.id)}
						canScan={canScan}
						canUpload={canUpload}
						canDelete={canDelete}
						onOpen={onOpen}
						onScan={onScan}
						onUpload={onUpload}
						onDelete={onDelete}
					/>
					{index < items.length - 1 && <Separator className="bg-border/60" />}
				</li>
			))}
		</ul>
	);
}

function LibraryRow({
	item,
	busy,
	canScan,
	canUpload,
	canDelete,
	onOpen,
	onScan,
	onUpload,
	onDelete,
}: {
	item: LibraryRowItem;
	busy: Task | undefined;
	canScan: boolean;
	canUpload: boolean;
	canDelete: boolean;
	onOpen: (item: LibraryRowItem, intent?: "folders" | "rename") => void;
	onScan: (item: LibraryRowItem) => void;
	onUpload: (item: LibraryRowItem) => void;
	onDelete: (item: LibraryRowItem) => void;
}) {
	const isAudiobook = item.mediaType === "audiobook";
	const uploadable = canUpload && !isAudiobook && item.hasEnabledPath;
	const contentLabel =
		item.bookCount === null
			? "—"
			: isAudiobook
				? m["media.audiobook_count"]({ count: item.bookCount })
				: m["media.book_count"]({ count: item.bookCount });

	return (
		<div className="group/library-row relative flex items-center gap-4 py-3">
			{/* The whole row opens the library; the trailing controls sit above it. */}
			<button
				type="button"
				onClick={() => onOpen(item)}
				aria-label={m["library.open_settings_for"]({ name: item.name })}
				className="absolute -inset-x-3 inset-y-0 rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring group-hover/library-row:bg-surface-hover motion-reduce:transition-none"
			/>

			<CoverStack
				covers={item.previewCovers}
				square={isAudiobook}
				mediaType={item.mediaType}
			/>

			<div className="pointer-events-none relative min-w-0 flex-1">
				<p className="truncate font-medium text-foreground text-sm">
					{item.name}
				</p>
				<p className="truncate text-muted-foreground text-sm">
					{isAudiobook ? m["media.audiobook"]() : m["media.ebook"]()}
					{" · "}
					{contentLabel}
					{" · "}
					{m["library.folder_count"]({ count: item.pathCount })}
				</p>
				{busy ? (
					<LibraryTaskProgress task={busy} className="mt-1" />
				) : (
					<p className="truncate text-muted-foreground/80 text-xs">
						{item.lastScannedAt
							? m["library.last_scanned"]({
									time: formatRelativeTime(item.lastScannedAt),
								})
							: m["library.never_scanned"]()}
					</p>
				)}
			</div>

			<div className="relative flex shrink-0 items-center gap-2">
				{!item.hasEnabledPath ? (
					<Badge variant="warning">{m["library.status_needs_folder"]()}</Badge>
				) : item.unreachablePathCount > 0 ? (
					<Badge variant="destructive">
						<WarningCircle aria-hidden className="size-3.5" />
						{m["library.folders_unreachable"]({
							count: item.unreachablePathCount,
						})}
					</Badge>
				) : null}

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-9 shrink-0"
							aria-label={m["library.row_actions"]({ name: item.name })}
						>
							<DotsThree weight="bold" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuGroup>
							{canScan && (
								<DropdownMenuItem
									disabled={!item.hasEnabledPath || busy !== undefined}
									onClick={() => onScan(item)}
								>
									<ArrowsClockwise />
									{m["library.scan_now"]()}
								</DropdownMenuItem>
							)}
							{uploadable && (
								<DropdownMenuItem onClick={() => onUpload(item)}>
									<UploadSimple />
									{m["library.upload_books"]()}
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onClick={() => onOpen(item, "rename")}>
								<PencilSimple />
								{m["library.rename"]()}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => onOpen(item, "folders")}>
								<FolderOpen />
								{m["library.section_folders"]()}
							</DropdownMenuItem>
							{canDelete && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										variant="destructive"
										onClick={() => onDelete(item)}
									>
										<Trash />
										{m["library.delete_library"]()}
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

// A deck, not a fan: the newest cover stays fully readable at 48px and the
// others only peek out behind it, so "this library has more" is legible instead
// of three cropped thumbnails fighting for the same space.
const DECK_DEPTH = [
	"z-30 start-0 h-11",
	"z-20 start-1.5 h-10 opacity-80",
	"z-10 start-3 h-9 opacity-60",
] as const;

function CoverStack({
	covers,
	square,
	mediaType,
}: {
	covers: string[];
	square: boolean;
	mediaType: "ebook" | "audiobook";
}) {
	const filenames = Array.from(
		new Set(
			covers
				.map(getCoverFilename)
				.filter((filename): filename is string => filename !== null),
		),
	).slice(0, 3);
	const Icon = mediaType === "audiobook" ? Headphones : BookOpen;

	if (filenames.length === 0) {
		return (
			<div className="pointer-events-none relative grid size-12 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
				<Icon className="size-5" weight="duotone" aria-hidden />
			</div>
		);
	}

	return (
		<div className="pointer-events-none relative h-12 w-12 shrink-0">
			{filenames.map((filename, index) => (
				<img
					key={filename}
					src={getCoverPresetUrl(filename, coverPresets.thumbnail)}
					srcSet={getCoverSrcSet(filename, coverPresets.thumbnail.widths)}
					sizes={coverPresets.thumbnail.sizes}
					alt=""
					loading="lazy"
					className={cn(
						"absolute top-1/2 -translate-y-1/2 rounded object-cover ring-1 ring-[var(--image-outline)]",
						square ? "aspect-square" : "aspect-[2/3]",
						DECK_DEPTH[index],
					)}
				/>
			))}
		</div>
	);
}
