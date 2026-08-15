import { CaretUp, Headphones, WarningCircle, X } from "@phosphor-icons/react";
import { memo, useMemo } from "react";
import { MarqueeText } from "@/components/audio-player/marquee-text";
import { PlayerIconButton } from "@/components/audio-player/player-controls";
import { PlayerLikeButton } from "@/components/audio-player/player-like-button";
import { PlayerSeekBar } from "@/components/audio-player/player-seek-bar";
import { PlayerSettings } from "@/components/audio-player/player-settings";
import {
	JumpBackButton,
	PlayerTransport,
	PlayPauseButton,
} from "@/components/audio-player/player-transport";
import { PlayerVolumeControl } from "@/components/audio-player/player-volume-control";
import {
	ReadListenFollowButton,
	ReadListenOpenButton,
	type ReadListenPlayerContext,
	ReadListenSentenceSeekButton,
} from "@/components/audio-player/read-listen-player";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatChapterLabel, getChapterMarkerPercents } from "@/utils/chapters";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames, formatTime } from "@/utils/format";

/** The title/author/chapter stack, shared by the mobile and desktop layouts. */
function TrackMeta({
	title,
	authorText,
	chapterLabel,
	showError,
	action,
	secondaryTabular = false,
}: {
	title: string;
	authorText: string | undefined;
	chapterLabel: string | null;
	showError: boolean;
	/** Rendered beside the title (the desktop bar puts the like button there). */
	action?: React.ReactNode;
	secondaryTabular?: boolean;
}) {
	return (
		<div className="min-w-0 flex-1 text-left">
			<div className="flex items-center gap-1">
				<MarqueeText
					text={title}
					className="min-w-0 flex-1 font-medium text-sm leading-tight"
				/>
				{action}
			</div>
			{showError ? (
				<p
					role="alert"
					className="mt-0.5 flex items-center gap-1 truncate text-destructive text-xs leading-tight"
				>
					<WarningCircle className="size-3 shrink-0" weight="fill" />
					<span className="truncate">{m["audiobook.playback_error"]()}</span>
				</p>
			) : (
				<>
					{authorText && (
						<p
							className={`mt-0.5 truncate text-muted-foreground text-xs leading-tight ${secondaryTabular ? "tabular-nums" : ""}`}
						>
							{authorText}
						</p>
					)}
					{chapterLabel && (
						<p className="mt-0.5 truncate text-[11px] text-muted-foreground/80 leading-tight">
							{chapterLabel}
						</p>
					)}
				</>
			)}
		</div>
	);
}

/** Chapter starts on the mobile progress line. Static between chapter edits. */
const ChapterMarkers = memo(function ChapterMarkers({
	chapters,
	totalDuration,
}: {
	chapters: { startTime: number }[];
	totalDuration: number;
}) {
	const markers = useMemo(
		() => getChapterMarkerPercents(chapters, totalDuration),
		[chapters, totalDuration],
	);
	return (
		<>
			{markers.map((pct) => (
				<span
					key={pct}
					className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-sidebar"
					style={{ left: `${pct}%` }}
				/>
			))}
		</>
	);
});

/**
 * Compact transport bar. Its cover doubles as the handle into the expanded
 * view — on phones, so does the whole strip between the controls.
 */
export const PlayerBar = memo(function PlayerBar({
	readListen,
	onOpenReadListen,
	onReadListenIntent,
	onReadListenCommitIntent,
	showStopButton = true,
}: {
	readListen?: ReadListenPlayerContext;
	onOpenReadListen?: () => void;
	onReadListenIntent?: () => void;
	onReadListenCommitIntent?: () => void;
	showStopButton?: boolean;
}) {
	const {
		audiobook,
		activeChapterIndex,
		showError,
		globalCurrentTime,
		totalDuration,
	} = useAudioPlayerState();
	const { stop, setExpanded } = useAudioPlayerActions();

	const cover = useMemo(() => {
		const filename = getCoverFilename(audiobook?.cover);
		if (!filename) return null;
		return {
			url: getCoverPresetUrl(filename, coverPresets.thumbnail),
			srcSet: getCoverSrcSet(filename, coverPresets.thumbnail.widths),
		};
	}, [audiobook?.cover]);
	const authorText = useMemo(
		() => formatNames(audiobook?.authors ?? []),
		[audiobook?.authors],
	);

	if (!audiobook) return null;

	const audiobookTitle = audiobook.title ?? audiobook.filename;
	const secondaryText = readListen
		? `${formatTime(globalCurrentTime)} / ${formatTime(totalDuration)}`
		: authorText;
	const chapterLabel =
		activeChapterIndex >= 0
			? formatChapterLabel(
					audiobook.chapters[activeChapterIndex],
					activeChapterIndex,
				)
			: null;

	const progress = totalDuration > 0 ? globalCurrentTime / totalDuration : 0;
	const compactControlClass = "max-[30rem]:size-10";

	const artwork = cover ? (
		<img
			src={cover.url}
			srcSet={cover.srcSet}
			sizes={coverPresets.thumbnail.sizes}
			alt={audiobookTitle}
			className="h-full w-full object-cover"
			loading="eager"
			decoding="async"
		/>
	) : (
		<div className="flex h-full w-full items-center justify-center">
			<Headphones className="size-4 text-muted-foreground" />
		</div>
	);

	const expand = () => setExpanded(true);

	return (
		<>
			{/* ── Mobile layout ── */}
			<div className="h-[var(--mobile-player-height)] border-sidebar-border border-t bg-sidebar pr-[var(--safe-area-right)] pl-[var(--safe-area-left)] md:hidden">
				<div className="relative flex h-[calc(var(--mobile-player-height)-2px)] items-center gap-2 px-2">
					{/* Everything the controls don't claim is the expand handle. */}
					<button
						type="button"
						aria-label={m["audiobook.player_expand"]()}
						onPointerDown={expand}
						onClick={expand}
						className="absolute inset-0"
					/>
					<div className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-2.5">
						<div className="size-11 shrink-0 overflow-hidden rounded bg-muted">
							{artwork}
						</div>
						<TrackMeta
							title={audiobookTitle}
							authorText={secondaryText}
							chapterLabel={chapterLabel}
							showError={showError}
							secondaryTabular={Boolean(readListen)}
						/>
					</div>
					{readListen ? (
						<div className="relative flex shrink-0 items-center justify-center">
							<PlayerTransport alwaysShowChapterControls />
							{!readListen.followText && (
								<ReadListenFollowButton
									context={readListen}
									className="size-8 text-foreground"
								/>
							)}
						</div>
					) : (
						<div className="relative flex shrink-0 items-center">
							<JumpBackButton className={compactControlClass} />
							<PlayPauseButton
								variant="strip"
								className={compactControlClass}
							/>
							{onOpenReadListen && (
								<ReadListenOpenButton
									onOpen={onOpenReadListen}
									onIntent={onReadListenIntent}
									onCommitIntent={onReadListenCommitIntent}
									label={m["read_listen.open_reader"]()}
									className="size-8 text-foreground"
								/>
							)}
							{showStopButton && (
								<PlayerIconButton
									label={m["audiobook.player_stop"]()}
									onClick={stop}
									className="size-7"
								>
									<X className="size-4" />
								</PlayerIconButton>
							)}
						</div>
					)}
				</div>
				{/* scaleX so the 4×/s update composites instead of relaying out the markers. */}
				<div className="relative h-0.5 overflow-hidden bg-foreground/20">
					<div
						className="h-full w-full origin-left bg-foreground transition-transform duration-300"
						style={{ transform: `scaleX(${progress})` }}
					/>
					<ChapterMarkers
						chapters={audiobook.chapters}
						totalDuration={totalDuration}
					/>
				</div>
			</div>

			{/* ── Desktop dock. Its surface absorbs the bottom inset (a landscape
			     tablet is >=md and still has a home indicator); --player-reserve
			     keeps the layout in step. ── */}
			<div className="hidden h-[var(--player-reserve)] border-border border-t bg-card px-4 pb-[var(--safe-area-bottom)] text-foreground shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.18)] md:block">
				{/* Three columns: info left, transport centered on ~half, controls right. */}
				<div className="flex h-full w-full items-center gap-4">
					<div className="flex min-w-0 flex-1 items-center gap-2.5">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={m["audiobook.player_expand"]()}
									onClick={expand}
									className="group/cover relative size-12 shrink-0 cursor-pointer overflow-hidden rounded bg-muted"
								>
									{artwork}
									<span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover/cover:opacity-100">
										<CaretUp className="size-5 text-white" />
									</span>
								</button>
							</TooltipTrigger>
							<TooltipContent side="top" sideOffset={8}>
								{m["audiobook.player_expand"]()}
							</TooltipContent>
						</Tooltip>
						<TrackMeta
							title={audiobookTitle}
							authorText={secondaryText}
							chapterLabel={chapterLabel}
							showError={showError}
							secondaryTabular={Boolean(readListen)}
							action={<PlayerLikeButton />}
						/>
					</div>

					<div
						className={cn(
							"flex max-w-3xl shrink-0 flex-col items-center gap-1",
							readListen ? "w-[42%]" : "w-1/2",
						)}
					>
						<div className="flex max-w-full items-center justify-center">
							<PlayerTransport
								alwaysShowChapterControls={Boolean(readListen)}
							/>
						</div>
						<PlayerSeekBar className="w-full" />
					</div>

					<div className="flex min-w-0 flex-1 items-center justify-end gap-0.5">
						{readListen && (
							<>
								{!readListen.followText && (
									<ReadListenFollowButton context={readListen} />
								)}
								<ReadListenSentenceSeekButton
									context={readListen}
									className="hidden lg:inline-flex"
								/>
							</>
						)}
						{!readListen && onOpenReadListen && (
							<ReadListenOpenButton
								onOpen={onOpenReadListen}
								onIntent={onReadListenIntent}
								onCommitIntent={onReadListenCommitIntent}
								label={m["read_listen.open_reader"]()}
							/>
						)}
						<PlayerIconButton
							label={m["audiobook.player_expand"]()}
							onClick={expand}
						>
							<CaretUp className="size-4" />
						</PlayerIconButton>
						<div className={cn(readListen && "hidden lg:block")}>
							<PlayerVolumeControl />
						</div>
						<PlayerSettings />
						{showStopButton && (
							<PlayerIconButton
								label={m["audiobook.player_stop"]()}
								onClick={stop}
							>
								<X className="size-4" />
							</PlayerIconButton>
						)}
					</div>
				</div>
			</div>
		</>
	);
});
