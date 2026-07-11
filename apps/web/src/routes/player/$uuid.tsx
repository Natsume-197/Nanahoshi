import { ORPCError } from "@orpc/client";
import {
	CaretDown,
	Headphones,
	List,
	WarningCircle,
} from "@phosphor-icons/react";
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	useLoaderData,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { useCallback, useState } from "react";
import {
	type Chapter,
	ChapterList,
} from "@/components/audio-player/chapter-list";
import { PlayerSeekBar } from "@/components/audio-player/player-seek-bar";
import { PlayerSettings } from "@/components/audio-player/player-settings";
import { PlayerTransport } from "@/components/audio-player/player-transport";
import { PlayerVolumeControl } from "@/components/audio-player/player-volume-control";
import { HeroBackdrop } from "@/components/shared/detail-page";
import { getHeroStyle } from "@/components/shared/detail-page/hero-style";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	toPlayerData,
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { getAudiobook } from "@/functions/books/get-audiobook";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { m } from "@/paraglide/messages";
import { getActiveChapterIndex } from "@/utils/chapters";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";

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
	const { loadAudiobook, seekTo } = useAudioPlayerActions();
	const { globalCurrentTime, isLoading, playbackError } = useAudioPlayerState();
	const showError = playbackError && !isLoading;

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

	const activeChapterIndex = getActiveChapterIndex(chapters, globalCurrentTime);

	const currentChapter =
		activeChapterIndex >= 0 ? chapters[activeChapterIndex] : null;

	const router = useRouter();
	const handleMinimize = useCallback(() => {
		const goBack = () => {
			if (window.history.length > 1) {
				router.history.back();
			} else {
				navigate({ to: "/dashboard" });
			}
		};

		// Reverse of the open morph: shrink the artwork back into the mini bar.
		// A plain back() bypasses the router's viewTransition option, so drive the
		// transition manually and hold the "new" snapshot until the previous route
		// has re-rendered (mini player back on screen with the shared cover).
		const prefersReducedMotion =
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (
			typeof document === "undefined" ||
			typeof document.startViewTransition !== "function" ||
			prefersReducedMotion
		) {
			goBack();
			return;
		}

		document.startViewTransition(
			() =>
				new Promise<void>((resolve) => {
					let settled = false;
					const finish = () => {
						if (settled) return;
						settled = true;
						unsubscribe();
						clearTimeout(fallback);
						resolve();
					};
					const unsubscribe = router.subscribe("onRendered", finish);
					// Never let a missed onRendered freeze the captured frame.
					const fallback = setTimeout(finish, 400);
					goBack();
				}),
		);
	}, [router, navigate]);

	const seekToChapter = useCallback(
		(startTime: number) => {
			seekTo(startTime);
			setShowChapters(false);
		},
		[seekTo],
	);

	return (
		<div
			className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground"
			style={getHeroStyle(mainColor) as CSSProperties}
		>
			{/* Ambient wash reused from the detail pages — soft, on-theme. */}
			<HeroBackdrop
				coverUrl={coverUrl}
				coverSrcSet={coverSrcSet}
				accent={mainColor}
			/>

			{/* Top bar */}
			<div className="relative z-10 flex items-center justify-between px-4 py-3">
				<Button
					variant="ghost"
					size="icon"
					onClick={handleMinimize}
					aria-label="Minimize player"
					className="text-muted-foreground"
				>
					<CaretDown className="size-6" />
				</Button>
				{chapters.length > 0 && (
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setShowChapters(true)}
						aria-label="Show chapters"
						className="text-muted-foreground"
					>
						<List className="size-5" />
					</Button>
				)}
			</div>

			{/* Main content */}
			<div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-6 py-4">
				{/* Cover art */}
				<div className="w-full max-w-[280px] md:max-w-[320px]">
					<div
						className="relative aspect-square overflow-hidden rounded-2xl shadow-lg ring-1 ring-border/60"
						style={{ viewTransitionName: "player-cover" }}
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
							<div className="flex h-full w-full items-center justify-center bg-muted">
								<Headphones className="size-20 text-muted-foreground" />
							</div>
						)}
					</div>
				</div>

				{/* Title / Author / Narrator */}
				<div className="w-full max-w-md text-center">
					<h1 className="font-bold text-foreground text-lg leading-snug">
						{title}
					</h1>
					{authorText && (
						<p className="mt-1 text-muted-foreground text-sm">{authorText}</p>
					)}
					{narratorText && (
						<p className="mt-0.5 text-muted-foreground text-xs">
							Narrated by {narratorText}
						</p>
					)}
					{currentChapter?.title && (
						<p className="mt-2 text-muted-foreground text-xs">
							{currentChapter.title}
						</p>
					)}
					{showError && (
						<p className="mt-2 flex items-center justify-center gap-1.5 text-destructive text-xs">
							<WarningCircle className="size-3.5 shrink-0" weight="fill" />
							{m["audiobook.playback_error"]()}
						</p>
					)}
				</div>

				{/* Seek bar (chapter markers + hover tooltip) */}
				<div className="w-full max-w-md">
					<PlayerSeekBar />
				</div>

				{/* Transport + secondary controls on one row */}
				<div className="flex items-center gap-4">
					<PlayerTransport size="lg" />
					<div className="flex items-center gap-0.5">
						<PlayerVolumeControl />
						<PlayerSettings align="center" />
					</div>
				</div>
			</div>

			{/* Chapters bottom sheet */}
			<Sheet open={showChapters} onOpenChange={setShowChapters}>
				<SheetContent
					side="bottom"
					className="max-h-[60vh] rounded-t-2xl border-border bg-card"
					showCloseButton={false}
				>
					<SheetHeader className="sr-only">
						<SheetTitle>Chapters</SheetTitle>
					</SheetHeader>
					<div className="p-4">
						<ChapterList
							chapters={chapters}
							currentTime={globalCurrentTime}
							onSeekToChapter={seekToChapter}
						/>
					</div>
				</SheetContent>
			</Sheet>
		</div>
	);
}
