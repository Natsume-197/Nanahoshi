import type { Task } from "@nanahoshi/api/modules/taskManager";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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

	return (
		<Table>
			<TableHeader>
				<TableRow className="hover:bg-transparent">
					<TableHead>{m["library.name"]()}</TableHead>
					<TableHead className="hidden md:table-cell">
						{m["library.table_type"]()}
					</TableHead>
					<TableHead className="text-right">
						{m["library.table_items"]()}
					</TableHead>
					<TableHead className="text-right">
						{m["library.section_folders"]()}
					</TableHead>
					<TableHead className="hidden sm:table-cell">
						{m["library.table_last_scan"]()}
					</TableHead>
					<TableHead className="w-12">
						<span className="sr-only">
							{m["library.row_actions"]({ name: "" })}
						</span>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{isLoading
					? [0, 1, 2].map((key) => (
							<TableRow key={key} className="hover:bg-transparent">
								<TableCell>
									<div className="flex items-center gap-3">
										<Skeleton className="size-10 rounded-lg" />
										<Skeleton className="h-4 w-40" />
									</div>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									<Skeleton className="h-4 w-16" />
								</TableCell>
								<TableCell className="text-right">
									<Skeleton className="ml-auto h-4 w-10" />
								</TableCell>
								<TableCell className="text-right">
									<Skeleton className="ml-auto h-4 w-10" />
								</TableCell>
								<TableCell className="hidden sm:table-cell">
									<Skeleton className="h-4 w-24" />
								</TableCell>
								<TableCell />
							</TableRow>
						))
					: items.map((item) => (
							<LibraryRow
								key={item.uuid}
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
						))}
			</TableBody>
		</Table>
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

	return (
		<TableRow className="cursor-pointer" onClick={() => onOpen(item)}>
			<TableCell>
				<div className="flex min-w-0 items-center gap-3">
					<CoverStack
						covers={item.previewCovers}
						square={isAudiobook}
						mediaType={item.mediaType}
					/>
					<button
						type="button"
						onClick={() => onOpen(item)}
						className="min-w-0 flex-1 truncate text-left font-medium text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{item.name}
					</button>
				</div>
			</TableCell>
			<TableCell className="hidden whitespace-nowrap text-muted-foreground text-sm md:table-cell">
				{isAudiobook ? m["media.audiobook"]() : m["media.ebook"]()}
			</TableCell>
			<TableCell className="text-right text-sm tabular-nums">
				{item.bookCount ?? "—"}
			</TableCell>
			<TableCell className="text-right">
				<span className="inline-flex items-center justify-end gap-2 text-sm tabular-nums">
					{!item.hasEnabledPath ? (
						<Badge variant="warning">
							{m["library.status_needs_folder"]()}
						</Badge>
					) : item.unreachablePathCount > 0 ? (
						<Badge variant="destructive">
							<WarningCircle aria-hidden className="size-3.5" />
							{m["library.folders_unreachable"]({
								count: item.unreachablePathCount,
							})}
						</Badge>
					) : (
						m["library.folder_count"]({ count: item.pathCount })
					)}
				</span>
			</TableCell>
			<TableCell className="hidden sm:table-cell">
				{busy ? (
					<LibraryTaskProgress task={busy} className="min-w-32" />
				) : (
					<span className="whitespace-nowrap text-muted-foreground text-sm">
						{item.lastScannedAt
							? formatRelativeTime(item.lastScannedAt)
							: m["library.never_scanned"]()}
					</span>
				)}
			</TableCell>
			<TableCell>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-9"
							aria-label={m["library.row_actions"]({ name: item.name })}
							onClick={(event) => event.stopPropagation()}
						>
							<DotsThree weight="bold" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuGroup>
							{canScan && (
								<DropdownMenuItem
									disabled={!item.hasEnabledPath || busy?.status === "running"}
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
			</TableCell>
		</TableRow>
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
			<div className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
				<Icon className="size-4" weight="duotone" aria-hidden />
			</div>
		);
	}

	return (
		<div className="relative h-10 w-10 shrink-0">
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
