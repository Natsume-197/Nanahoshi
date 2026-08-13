import {
	CaretDown,
	Headphones,
	ListBullets,
	Timer,
	WarningCircle,
} from "@phosphor-icons/react";
import { memo, useMemo, useState } from "react";
import { realTimeAt } from "@/components/audio-player/chapter-progress";
import { MarqueeText } from "@/components/audio-player/marquee-text";
import { PlayerChapterPanel } from "@/components/audio-player/player-chapter-panel";
import { PlayerIconButton } from "@/components/audio-player/player-controls";
import { PlayerLikeButton } from "@/components/audio-player/player-like-button";
import { PlayerModeSelector } from "@/components/audio-player/player-mode-selector";
import { PlayerMoreMenu } from "@/components/audio-player/player-more-menu";
import {
	type PlayerReadListenPairing,
	PlayerReadListenPanel,
} from "@/components/audio-player/player-read-listen-panel";
import { PlayerSeekBar } from "@/components/audio-player/player-seek-bar";
import { SleepButton } from "@/components/audio-player/player-sleep-control";
import { SpeedButton } from "@/components/audio-player/player-speed-control";
import { PlayerTransport } from "@/components/audio-player/player-transport";
import { PlayerVolumeControl } from "@/components/audio-player/player-volume-control";
import {
	ReadListenControlsGroup,
	type ReadListenPlayerContext,
} from "@/components/audio-player/read-listen-player";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { useIsBelowLg } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getCoverFilename, getCoverUrl } from "@/utils/covers";
import { formatNames, formatTime } from "@/utils/format";

// No srcSet: `sizes` would become the image's intrinsic width, capping the
// artwork at whatever it claimed instead of "as large as fits".
const COVER_WIDTH = 1200;

/** Dark token set for the panel, so every control inside stays correct. */
const SCENE_STYLE = {
	// The popovers portal out to the app theme, so keep the app's radius.
	"--radius": "inherit",
	// Neutral like the app scale, but on its own darker ladder: the tint
	// gradient falls from the cover colour to near-black, so this floor sits
	// below --background on purpose.
	"--background": "oklch(0.145 0 90)",
	"--player-source": "#625a78",
	"--foreground": "oklch(0.985 0 0)",
	"--reading": "oklch(0.985 0 0)",
	"--card": "oklch(0.235 0 90)",
	"--card-foreground": "oklch(0.985 0 0)",
	"--popover": "oklch(0.205 0 90)",
	"--popover-foreground": "oklch(0.985 0 0)",
	"--primary": "oklch(0.985 0 0)",
	"--primary-foreground": "oklch(0.18 0 90)",
	"--secondary": "oklch(0.3 0 90)",
	"--secondary-foreground": "oklch(0.985 0 0)",
	"--muted": "oklch(0.28 0 90)",
	// Brighter than the app's own muted step: this text sits on a tinted
	// backdrop, where the usual grey reads as switched off.
	"--muted-foreground": "oklch(0.86 0 90)",
	"--accent": "oklch(0.3 0 90)",
	"--accent-foreground": "oklch(0.985 0 0)",
	"--destructive": "oklch(0.72 0.18 25)",
	"--border": "oklch(1 0 0 / 12%)",
	"--input": "oklch(1 0 0 / 12%)",
	"--ring": "oklch(0.85 0 0)",
	colorScheme: "dark",
} as React.CSSProperties;

const PILL_ACTIVE_CLASS = "bg-foreground/15 text-foreground";

export type PlayerSidePanelMode = "chapters" | "read-listen" | null;

function PlayerSidePanel({
	mode,
	chapters,
	activeChapterIndex,
	onSeekToChapter,
	readListenPairings,
	selectedReadListenPairingId,
	onReadListenPairingChange,
	className,
}: {
	mode: Exclude<PlayerSidePanelMode, null>;
	chapters: {
		index: number;
		title: string | null;
		startTime: number;
		endTime: number;
	}[];
	activeChapterIndex: number;
	onSeekToChapter: (startTime: number) => void;
	readListenPairings: PlayerReadListenPairing[];
	selectedReadListenPairingId: string | null;
	onReadListenPairingChange: (pairingId: string) => void;
	className?: string;
}) {
	return (
		<div className={cn("flex min-h-0 flex-col", className)}>
			{mode === "chapters" ? (
				<PlayerChapterPanel
					chapters={chapters}
					activeIndex={activeChapterIndex}
					onSeekToChapter={onSeekToChapter}
					className="h-full px-1 pb-1"
				/>
			) : (
				readListenPairings.length > 0 && (
					<PlayerReadListenPanel
						pairings={readListenPairings}
						selectedPairingId={selectedReadListenPairingId}
						onPairingChange={onReadListenPairingChange}
						className="h-full"
					/>
				)
			)}
		</div>
	);
}

export const ExpandedPlayer = memo(function ExpandedPlayer({
	readListen,
	readListenPairings,
	selectedReadListenPairingId,
	onReadListenPairingChange,
	onOpenReadListenReader,
	sidePanel,
	onSidePanelChange,
}: {
	readListen?: ReadListenPlayerContext;
	readListenPairings: PlayerReadListenPairing[];
	selectedReadListenPairingId: string | null;
	onReadListenPairingChange: (pairingId: string) => void;
	onOpenReadListenReader: (pairing: PlayerReadListenPairing) => void;
	sidePanel: PlayerSidePanelMode;
	onSidePanelChange: (mode: PlayerSidePanelMode) => void;
}) {
	const {
		audiobook,
		activeChapterIndex,
		globalCurrentTime,
		totalDuration,
		speed,
		isPlaying,
		showError,
	} = useAudioPlayerState();
	const { seekTo, setExpanded } = useAudioPlayerActions();

	const [showChapterSeek, setShowChapterSeek] = useState(false);
	// A media query, not a `lg:` class: it decides which parent the panel is under.
	const isBelowLg = useIsBelowLg();

	const coverUrl = useMemo(() => {
		const filename = getCoverFilename(audiobook?.cover);
		return filename ? getCoverUrl(filename, COVER_WIDTH) : null;
	}, [audiobook?.cover]);
	const sceneStyle = useMemo(() => {
		if (!audiobook?.mainColor) return SCENE_STYLE;
		return {
			...SCENE_STYLE,
			"--player-source": audiobook.mainColor,
		} as React.CSSProperties;
	}, [audiobook?.mainColor]);
	// Audiobooks often ship narrators and no author; the line reads the same.
	const authorText = useMemo(
		() =>
			formatNames(audiobook?.authors ?? []) ||
			formatNames(audiobook?.narrators ?? []),
		[audiobook?.authors, audiobook?.narrators],
	);
	if (!audiobook) return null;

	const title = audiobook.title ?? audiobook.filename;
	const chapters = audiobook.chapters;
	const hasChapters = chapters.length > 0;
	const chapter = chapters[activeChapterIndex];
	const inlineSidePanel = sidePanel !== null && isBelowLg;
	const selectedReadListenPairing = readListenPairings.find(
		(pairing) => pairing.id === selectedReadListenPairingId,
	);
	// Remaining wall-clock time at the current rate, not remaining book seconds.
	const timeLeft = formatTime(
		realTimeAt(Math.max(0, totalDuration - globalCurrentTime), speed),
	);

	return (
		<div
			className="dark relative flex h-full flex-col overflow-hidden bg-background text-foreground"
			style={sceneStyle}
		>
			<div
				aria-hidden
				className="player-ambient-field pointer-events-none absolute inset-0 overflow-hidden"
			>
				<div className="player-ambient-orbs" />
				<div className="player-ambient-veil" />
			</div>

			{/* Insets here, not on the panel, so the scene still paints under the notch. */}
			<div className="relative flex min-h-0 flex-1 flex-col pt-[var(--safe-area-top)] pr-[var(--safe-area-right)] pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)]">
				{/* One button's padding less than the content below, so the icons land
				    on the title's edge. */}
				<div className="grid min-h-12 shrink-0 touch-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1 max-[22rem]:grid-cols-2 md:min-h-14 md:px-6">
					<PlayerIconButton
						label={m["audiobook.player_collapse"]()}
						side="bottom"
						onClick={() => setExpanded(false)}
						className="size-10 text-foreground"
					>
						<CaretDown className="size-5" />
					</PlayerIconButton>

					{!readListen && readListenPairings.length > 0 && (
						<div className="pointer-events-none col-start-2 row-start-1 flex min-w-0 justify-center max-[22rem]:col-span-2 max-[22rem]:col-start-1 max-[22rem]:row-start-2">
							<PlayerModeSelector
								mode={sidePanel === "read-listen" ? "read-listen" : "listen"}
								onModeChange={(mode) =>
									onSidePanelChange(
										mode === "read-listen" ? "read-listen" : null,
									)
								}
							/>
						</div>
					)}

					<div className="col-start-3 row-start-1 flex items-center gap-1 justify-self-end max-[22rem]:col-start-2">
						{readListen && (
							<ReadListenControlsGroup
								context={readListen}
								side="bottom"
								className="gap-1"
								buttonClassName="size-10 text-foreground"
							/>
						)}
						<PlayerMoreMenu
							uuid={audiobook.uuid}
							onOpenReadListenReader={
								selectedReadListenPairing
									? () => onOpenReadListenReader(selectedReadListenPairing)
									: undefined
							}
						/>
					</div>
				</div>

				<div className="flex min-h-0 min-w-0 flex-1 justify-center gap-8 overflow-hidden px-5 pb-4 md:px-8 md:pb-6">
					{/* Below lg the chapter list takes the artwork's place inside the
					    column, so the transport and the Chapters toggle stay reachable. */}
					<div className="flex min-h-0 w-full min-w-0 max-w-md flex-col items-center justify-center gap-4 md:max-w-lg md:gap-5 xl:max-w-xl">
						{/* touch-none per surface, never on the column: the chapter list must
						    not sit under an ancestor that forbids panning, and the page
						    behind must not take the gesture mid-pull. */}
						<div
							className={cn(
								"flex min-h-0 w-full flex-1 items-center justify-center",
								!inlineSidePanel && "touch-none",
							)}
						>
							{inlineSidePanel ? (
								<PlayerSidePanel
									mode={sidePanel}
									chapters={chapters}
									activeChapterIndex={activeChapterIndex}
									onSeekToChapter={seekTo}
									readListenPairings={readListenPairings}
									selectedReadListenPairingId={selectedReadListenPairingId}
									onReadListenPairingChange={onReadListenPairingChange}
									className="h-full w-full"
								/>
							) : coverUrl ? (
								<img
									src={coverUrl}
									alt={title}
									// max-* only: an explicit height outgrows a narrow cover and
									// detaches the shadow from the art.
									className={cn(
										"max-h-full max-w-full rounded-[12px] object-contain shadow-[0_20px_50px_-20px_oklch(0_0_0/0.85)] outline outline-[var(--image-outline)] -outline-offset-1 transition-transform duration-500 ease-[var(--ease-smooth-out)] motion-reduce:transition-none",
										!isPlaying && "scale-[0.94]",
									)}
									decoding="async"
								/>
							) : (
								<div className="flex aspect-square max-h-full w-full items-center justify-center rounded-[12px] bg-foreground/10">
									<Headphones
										className="size-16 text-foreground/45"
										weight="thin"
									/>
								</div>
							)}
						</div>

						<div className="flex w-full min-w-0 shrink-0 touch-none items-start gap-3">
							<div className="min-w-0 flex-1">
								<h2 className="font-bold text-xl leading-tight md:text-2xl">
									<MarqueeText text={title} />
								</h2>
								{authorText && (
									<p
										title={authorText}
										className="mt-1.5 truncate text-muted-foreground text-sm"
									>
										{authorText}
									</p>
								)}
								{readListen && (
									<p
										title={readListen.statusText}
										className="mt-2 line-clamp-2 text-foreground/80 text-sm leading-normal"
									>
										{readListen.statusText}
									</p>
								)}
							</div>
							<PlayerLikeButton
								className="mt-0.5 size-10 shrink-0"
								iconClassName="size-5 md:size-6"
							/>
						</div>

						<div className="flex w-full min-w-0 shrink-0 touch-none flex-col gap-1">
							{showError ? (
								<p
									role="alert"
									className="flex items-center gap-1.5 text-destructive text-sm"
								>
									<WarningCircle className="size-4 shrink-0" weight="fill" />
									{m["audiobook.playback_error"]()}
								</p>
							) : (
								// At 1× the seek bar already counts this down.
								speed !== 1 && (
									<p className="flex justify-end text-muted-foreground text-xs tabular-nums">
										{m["audiobook.time_left"]({ time: timeLeft })}
									</p>
								)
							)}
							<PlayerSeekBar size="lg" />
							{showChapterSeek && chapter && (
								<PlayerSeekBar
									className="bar-in"
									size="lg"
									scope="chapter"
									chapter={chapter}
								/>
							)}
						</div>

						<PlayerTransport size="expanded" />

						<div className="flex w-full min-w-0 shrink-0 touch-none items-center justify-between gap-1">
							<div className="flex min-w-0 items-center gap-1">
								<SpeedButton />
								<SleepButton />
							</div>
							<div className="flex min-w-0 items-center gap-1">
								<div className="hidden md:block">
									<PlayerVolumeControl
										className="size-11 rounded-full text-foreground"
										iconClassName="size-5"
									/>
								</div>
								{hasChapters && (
									<>
										<PlayerIconButton
											label={m["audiobook.player_chapter_time"]()}
											pressed={showChapterSeek}
											onClick={() => setShowChapterSeek((prev) => !prev)}
											className={cn(
												"size-11 rounded-full text-foreground",
												showChapterSeek && PILL_ACTIVE_CLASS,
											)}
										>
											<Timer
												className="size-5"
												weight={showChapterSeek ? "fill" : "regular"}
											/>
										</PlayerIconButton>
										<PlayerIconButton
											label={m["audiobook.player_chapters"]()}
											pressed={sidePanel === "chapters"}
											onClick={() =>
												onSidePanelChange(
													sidePanel === "chapters" ? null : "chapters",
												)
											}
											className={cn(
												"size-11 rounded-full text-foreground",
												sidePanel === "chapters" && PILL_ACTIVE_CLASS,
											)}
										>
											<ListBullets
												className="size-5"
												weight={sidePanel === "chapters" ? "bold" : "regular"}
											/>
										</PlayerIconButton>
									</>
								)}
							</div>
						</div>
					</div>

					{sidePanel && !inlineSidePanel && (
						<PlayerSidePanel
							mode={sidePanel}
							chapters={chapters}
							activeChapterIndex={activeChapterIndex}
							onSeekToChapter={seekTo}
							readListenPairings={readListenPairings}
							selectedReadListenPairingId={selectedReadListenPairingId}
							onReadListenPairingChange={onReadListenPairingChange}
							className="min-h-0 w-[min(30rem,38vw)] shrink-0"
						/>
					)}
				</div>
			</div>
		</div>
	);
});
