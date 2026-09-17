import { BookmarkSimple, Trash } from "@phosphor-icons/react";
import { memo, useRef, useState } from "react";
import {
	addBookmark,
	removeBookmark,
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

/** Local-first bookmarks for the active book (see bookmarks.ts). */
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
	const [label, setLabel] = useState("");
	// Clear the draft label when the book changes (render-phase guard).
	const uuidRef = useRef(uuid);
	if (uuid !== uuidRef.current) {
		uuidRef.current = uuid;
		setLabel("");
	}

	if (!audiobook || !uuid) return null;

	const chapters = audiobook.chapters;
	const chapterIndex = getActiveChapterIndex(chapters, globalCurrentTime);
	const fallbackLabel =
		chapterIndex >= 0
			? (formatChapterLabel(chapters[chapterIndex], chapterIndex) ??
				formatTime(globalCurrentTime))
			: formatTime(globalCurrentTime);

	const handleAdd = () => {
		if (!uuid) return;
		addBookmark(uuid, globalCurrentTime, label.trim() || fallbackLabel);
		setLabel("");
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
						: "px-2 pb-2 text-[11px] text-muted-foreground uppercase tracking-[0.14em]",
				)}
			>
				{m["audiobook.player_bookmarks"]()}
			</p>
			<form
				className={cn(
					"flex shrink-0 gap-1.5",
					isPopover ? "flex-col gap-2" : "px-1 pb-2",
				)}
				onSubmit={(e) => {
					e.preventDefault();
					handleAdd();
				}}
			>
				<Input
					value={label}
					onChange={(e) => setLabel(e.target.value)}
					placeholder={m["audiobook.player_bookmark_label_placeholder"]()}
					aria-label={m["audiobook.player_bookmark_add"]()}
					className="h-8 text-xs"
				/>
				<Button type="submit" size="sm" className="h-8 shrink-0 text-xs">
					<BookmarkSimple aria-hidden="true" />
					{m["audiobook.player_bookmark_add"]()}
				</Button>
			</form>
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
								<div className="group flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-accent/60">
									<button
										type="button"
										onClick={() => seekTo(bookmark.time)}
										className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left"
									>
										<span className="w-4 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
											{index + 1}
										</span>
										<span className="shrink-0 font-mono text-[11px] text-primary tabular-nums">
											{formatTime(bookmark.time)}
										</span>
										<span className="min-w-0 flex-1 truncate text-xs">
											{bookmark.label || formatTime(bookmark.time)}
										</span>
									</button>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={m["audiobook.player_bookmark_delete"]()}
										onClick={() => removeBookmark(uuid, bookmark.id)}
										className="size-7 shrink-0 text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
									>
										<Trash aria-hidden="true" className="size-3.5" />
									</Button>
								</div>
							</li>
						))}
					</ol>
				)}
			</div>
		</div>
	);
});
