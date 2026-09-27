import {
	BookmarkSimple,
	Check,
	PencilSimple,
	Trash,
} from "@phosphor-icons/react";
import { memo, useState } from "react";
import {
	type AudioBookmark,
	addBookmark,
	removeBookmark,
	renameBookmark,
	useBookmarks,
} from "@/components/audio-player/bookmarks";
import { PlayerPopoverButton } from "@/components/audio-player/player-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { typesetProps } from "@/lib/text-lang";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatChapterLabel, getActiveChapterIndex } from "@/utils/chapters";
import { formatTime } from "@/utils/format";

export const PlayerBookmarksButton = memo(function PlayerBookmarksButton({
	className,
}: {
	className?: string;
}) {
	return (
		<PlayerPopoverButton
			label={m["audiobook.player_bookmarks"]()}
			side="top"
			align="end"
			className={className}
			contentClassName="w-64 max-w-[calc(100vw-1rem)] gap-3"
			trigger={<BookmarkSimple aria-hidden="true" className="size-4" />}
		>
			<PlayerBookmarksPanel
				variant="popover"
				className="max-h-[min(24rem,var(--available-height))]"
			/>
		</PlayerPopoverButton>
	);
});

/** One bookmark row: jump on tap, rename and delete in place. */
const BookmarkRow = memo(function BookmarkRow({
	uuid,
	bookmark,
	index,
	chapterLabel,
	onSeek,
}: {
	uuid: string;
	bookmark: AudioBookmark;
	index: number;
	chapterLabel: string | null;
	onSeek: (time: number) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const title = bookmark.label || chapterLabel || formatTime(bookmark.time);
	// Older bookmarks stored the chapter as their label; don't say it twice.
	const subtitle =
		bookmark.label && chapterLabel && bookmark.label !== chapterLabel
			? chapterLabel
			: null;

	const commit = () => {
		renameBookmark(uuid, bookmark.id, draft.trim());
		setEditing(false);
	};

	if (editing) {
		return (
			<form
				className="flex items-center gap-1 rounded-lg px-1 py-1"
				onSubmit={(e) => {
					e.preventDefault();
					commit();
				}}
			>
				<span className="shrink-0 px-1.5 font-mono text-[11px] text-primary tabular-nums">
					{formatTime(bookmark.time)}
				</span>
				<Input
					autoFocus
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							e.stopPropagation();
							setEditing(false);
						}
					}}
					placeholder={
						chapterLabel ?? m["audiobook.player_bookmark_label_placeholder"]()
					}
					aria-label={m["audiobook.player_bookmark_edit"]()}
					className="h-9 min-w-0 flex-1 text-sm"
				/>
				<Button
					type="submit"
					variant="ghost"
					size="icon"
					aria-label={m["audiobook.player_bookmark_label_save"]()}
					className="size-9 shrink-0"
				>
					<Check aria-hidden="true" className="size-4" />
				</Button>
			</form>
		);
	}

	return (
		<div className="group flex items-center gap-0.5 rounded-xl px-1 transition-colors hover:bg-foreground/[0.06]">
			<button
				type="button"
				onClick={() => onSeek(bookmark.time)}
				className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-2 text-left"
			>
				<span className="w-4 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
					{index + 1}
				</span>
				<span className="shrink-0 font-mono text-[11px] text-primary tabular-nums">
					{formatTime(bookmark.time)}
				</span>
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-sm" {...typesetProps(title)}>
						{title}
					</span>
					{subtitle && (
						<span
							className="truncate text-[11px] text-muted-foreground"
							{...typesetProps(subtitle)}
						>
							{subtitle}
						</span>
					)}
				</span>
			</button>
			{/* Revealed on hover for a mouse; a touch screen has no hover, so there
			    they are always shown. */}
			<div className="flex shrink-0 items-center opacity-0 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover:opacity-100">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={m["audiobook.player_bookmark_edit"]()}
					onClick={() => {
						setDraft(bookmark.label);
						setEditing(true);
					}}
					className="size-9 text-muted-foreground"
				>
					<PencilSimple aria-hidden="true" className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={m["audiobook.player_bookmark_delete"]()}
					onClick={() => removeBookmark(uuid, bookmark.id)}
					className="size-9 text-muted-foreground hover:text-destructive"
				>
					<Trash aria-hidden="true" className="size-4" />
				</Button>
			</div>
		</div>
	);
});

/**
 * Local-first bookmarks for the active book (see bookmarks.ts). Saving is one
 * tap — the moment is what matters mid-listen — and a note can be added to
 * any row afterwards.
 */
export const PlayerBookmarksPanel = memo(function PlayerBookmarksPanel({
	className,
	variant = "panel",
}: {
	className?: string;
	variant?: "panel" | "popover";
}) {
	const { audiobook, globalCurrentTime } = useAudioPlayerState();
	const { seekTo } = useAudioPlayerActions();
	const uuid = audiobook?.uuid ?? null;

	// Live list: adding/removing anywhere (panel, popover, another tab)
	// re-renders here through the bookmark store.
	const bookmarks = useBookmarks(uuid);

	if (!audiobook || !uuid) return null;

	const chapters = audiobook.chapters;
	const chapterLabelAt = (time: number) => {
		const index = getActiveChapterIndex(chapters, time);
		return index >= 0 ? formatChapterLabel(chapters[index], index) : null;
	};

	const isPopover = variant === "popover";

	return (
		<div
			className={cn("flex min-h-0 flex-col", isPopover && "gap-2", className)}
		>
			<p
				className={cn(
					"shrink-0",
					isPopover
						? "font-medium text-xs"
						: "px-3 pb-3 font-semibold text-base text-foreground",
				)}
			>
				{m["audiobook.player_bookmarks"]()}
			</p>
			<div className={cn("shrink-0", !isPopover && "px-1 pb-2")}>
				<Button
					type="button"
					onClick={() => addBookmark(uuid, globalCurrentTime)}
					className="h-10 w-full gap-2 text-sm"
				>
					<BookmarkSimple aria-hidden="true" weight="fill" />
					{m["audiobook.player_bookmark_add"]()}
					<span className="font-mono text-xs tabular-nums opacity-70">
						{formatTime(globalCurrentTime)}
					</span>
				</Button>
			</div>
			{isPopover && <Separator className="my-1" />}
			<div
				data-sheet-ignore
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
			>
				{bookmarks.length === 0 ? (
					<p className="px-2 py-4 text-center text-muted-foreground text-xs">
						{m["audiobook.player_bookmarks_empty"]()}
					</p>
				) : (
					<ol className="flex flex-col gap-0.5">
						{bookmarks.map((bookmark, index) => (
							<li key={bookmark.id}>
								<BookmarkRow
									uuid={uuid}
									bookmark={bookmark}
									index={index}
									chapterLabel={chapterLabelAt(bookmark.time)}
									onSeek={seekTo}
								/>
							</li>
						))}
					</ol>
				)}
			</div>
		</div>
	);
});
