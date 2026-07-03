import { ORPCError } from "@orpc/client";
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	useLoaderData,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { ChevronDown, Headphones, List } from "lucide-react";
import { useCallback, useState } from "react";
import {
	type Chapter,
	ChapterList,
} from "@/components/audio-player/chapter-list";
import { PlaybackControls } from "@/components/audio-player/playback-controls";
import { SeekBar } from "@/components/audio-player/seek-bar";
import { SleepTimer } from "@/components/audio-player/sleep-timer";
import { SpeedSelector } from "@/components/audio-player/speed-selector";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	type AudiobookPlayerData,
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { getAudiobook } from "@/functions/books/get-audiobook";
import { useMountEffect } from "@/hooks/use-mount-effect";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames, formatReadingTime } from "@/utils/format";

export const Route = createFileRoute("/player/$uuid")({
	component: PlayerPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
	loader: async ({ params }) => {
		try {
			const audiobook = await getAudiobook({ data: params.uuid });
			return { audiobook };
		} catch (error) {
			if (error instanceof ORPCError && error.status === 404) {
				throw notFound();
			}
			throw error;
		}
	},
});

type LoaderAudiobook = NonNullable<Awaited<ReturnType<typeof getAudiobook>>>;

function toPlayerData(ab: LoaderAudiobook): AudiobookPlayerData {
	return {
		uuid: ab.uuid,
		title: ab.title,
		filename: ab.filename,
		cover: ab.cover,
		mainColor: ab.mainColor,
		duration: ab.duration,
		authors: ab.authors?.map((a) => ({ name: a.name })) ?? [],
		narrators: ab.narrators?.map((n) => ({ name: n.name })) ?? [],
		chapters: (ab.chapters ?? []).map((ch) => ({
			index: ch.index,
			title: ch.title,
			startTime: ch.startTime,
			endTime: ch.endTime,
		})),
		audioFiles: (ab.audioFiles ?? []).map((f) => ({
			index: f.index,
			duration: f.duration,
		})),
	};
}

function formatDuration(seconds: number): string {
	return formatReadingTime(seconds);
}

function PlayerPage() {
	const { audiobook } = useLoaderData({ from: "/player/$uuid" });

	if (!audiobook) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<p className="text-destructive text-lg">Audiobook not found</p>
					<Link
						to="/dashboard"
						className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
					>
						Go back
					</Link>
				</div>
			</div>
		);
	}

	return <PlayerContent audiobook={audiobook} />;
}

function PlayerContent({ audiobook }: { audiobook: LoaderAudiobook }) {
	const navigate = useNavigate();
	const { loadAudiobook, togglePlay, seekTo, seekRelative, setSpeed, pause } =
		useAudioPlayerActions();
	const { isPlaying, globalCurrentTime, totalDuration, speed } =
		useAudioPlayerState();

	const [showChapters, setShowChapters] = useState(false);

	useMountEffect(() => {
		loadAudiobook(toPlayerData(audiobook));
	});

	const title = audiobook.title ?? audiobook.filename;
	const coverFilename = getCoverFilename(audiobook.cover);
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.detail)
		: null;
	const coverSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.detail.widths)
		: undefined;
	const authorText = formatNames(audiobook.authors);
	const narratorText = formatNames(audiobook.narrators);
	const mainColor = audiobook.mainColor ?? null;

	const chapters: Chapter[] = (audiobook.chapters ?? []).map((ch) => ({
		index: ch.index,
		title: ch.title,
		startTime: ch.startTime,
		endTime: ch.endTime,
	}));

	let activeChapterIndex = -1;
	for (let i = chapters.length - 1; i >= 0; i--) {
		if (globalCurrentTime >= (chapters[i]?.startTime ?? 0)) {
			activeChapterIndex = i;
			break;
		}
	}

	const goToPrevChapter = useCallback(() => {
		if (activeChapterIndex > 0) {
			seekTo(chapters[activeChapterIndex - 1]?.startTime ?? 0);
		} else if (chapters.length > 0) {
			seekTo(chapters[0]?.startTime ?? 0);
		}
	}, [activeChapterIndex, chapters, seekTo]);

	const goToNextChapter = useCallback(() => {
		if (activeChapterIndex < chapters.length - 1) {
			seekTo(chapters[activeChapterIndex + 1]?.startTime ?? 0);
		}
	}, [activeChapterIndex, chapters, seekTo]);

	const currentChapter =
		activeChapterIndex >= 0 ? chapters[activeChapterIndex] : null;

	const router = useRouter();
	const handleMinimize = useCallback(() => {
		if (window.history.length > 1) {
			router.history.back();
		} else {
			navigate({ to: "/dashboard" });
		}
	}, [router, navigate]);

	const handleSleep = useCallback(() => {
		pause();
	}, [pause]);

	const seekToChapter = useCallback(
		(startTime: number) => {
			seekTo(startTime);
			setShowChapters(false);
		},
		[seekTo],
	);

	return (
		<div
			className="fixed inset-0 z-50 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
			style={
				{
					"--player-accent": mainColor ?? "#1a1a2e",
					background:
						"linear-gradient(to bottom, var(--player-accent) 0%, color-mix(in oklch, var(--player-accent) 40%, #0a0a0f 60%) 50%, #0a0a0f 100%)",
				} as React.CSSProperties
			}
		>
			{/* Top bar */}
			<div className="flex items-center justify-between px-4 py-3">
				<Button
					variant="ghost"
					size="icon"
					onClick={handleMinimize}
					aria-label="Minimize player"
					className="text-white/70 hover:bg-white/10 hover:text-white"
				>
					<ChevronDown className="size-6" />
				</Button>
				<div className="min-w-0 flex-1 px-3 text-center">
					<p className="truncate font-medium text-white/60 text-xs uppercase tracking-wider">
						Now Playing
					</p>
				</div>
				{chapters.length > 0 && (
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setShowChapters(true)}
						aria-label="Show chapters"
						className="text-white/70 hover:bg-white/10 hover:text-white"
					>
						<List className="size-5" />
					</Button>
				)}
			</div>

			{/* Main content */}
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-4">
				{/* Cover art */}
				<div className="w-full max-w-[280px] md:max-w-[320px]">
					<div
						className="relative aspect-square overflow-hidden rounded-2xl shadow-2xl"
						style={{
							boxShadow: mainColor
								? `0 25px 50px -12px ${mainColor}66`
								: undefined,
						}}
					>
						{coverUrl ? (
							<img
								src={coverUrl}
								srcSet={coverSrcSet}
								sizes={coverPresets.detail.sizes}
								alt={title}
								className="h-full w-full object-cover"
								loading="eager"
								decoding="async"
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center bg-white/5">
								<Headphones className="size-20 text-white/20" />
							</div>
						)}
					</div>
				</div>

				{/* Title / Author / Narrator */}
				<div className="w-full max-w-md text-center">
					<h1 className="font-bold text-lg text-white leading-snug">{title}</h1>
					{authorText && (
						<p className="mt-1 text-sm text-white/60">{authorText}</p>
					)}
					{narratorText && (
						<p className="mt-0.5 text-white/40 text-xs">
							Narrated by {narratorText}
						</p>
					)}
					{currentChapter?.title && (
						<p className="mt-2 text-white/40 text-xs">{currentChapter.title}</p>
					)}
				</div>

				{/* Seek bar */}
				<div className="w-full max-w-md">
					<SeekBar
						currentTime={globalCurrentTime}
						duration={totalDuration}
						onSeek={seekTo}
						variant="player"
					/>
				</div>

				{/* Playback controls */}
				<PlaybackControls
					isPlaying={isPlaying}
					onTogglePlay={togglePlay}
					onSeekRelative={seekRelative}
					onPrevChapter={goToPrevChapter}
					onNextChapter={goToNextChapter}
					hasPrevChapter={activeChapterIndex > 0}
					hasNextChapter={activeChapterIndex < chapters.length - 1}
					variant="player"
				/>

				{/* Speed + Sleep + Duration */}
				<div className="flex items-center gap-3">
					<SpeedSelector
						speed={speed}
						onSpeedChange={setSpeed}
						variant="player"
					/>
					<SleepTimer onSleep={handleSleep} variant="player" />
					{totalDuration > 0 && (
						<span className="text-white/50 text-xs">
							{formatDuration(totalDuration)}
						</span>
					)}
				</div>
			</div>

			{/* Chapters bottom sheet */}
			<Sheet open={showChapters} onOpenChange={setShowChapters}>
				<SheetContent
					side="bottom"
					className="max-h-[60vh] rounded-t-2xl border-white/10 bg-[#1a1a2e]"
					showCloseButton={false}
				>
					<SheetHeader className="border-white/10 border-b pb-3">
						<SheetTitle className="text-white">Chapters</SheetTitle>
					</SheetHeader>
					<div className="overflow-y-auto p-4">
						<ChapterList
							chapters={chapters}
							currentTime={globalCurrentTime}
							onSeekToChapter={seekToChapter}
							variant="player"
						/>
					</div>
				</SheetContent>
			</Sheet>
		</div>
	);
}
