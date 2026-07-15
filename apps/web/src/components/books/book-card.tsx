import { BookOpen, CircleNotch, Play } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { memo, useCallback, useRef } from "react";
import {
	usePlayAudiobook,
	usePrefetchAudiobook,
} from "@/components/audio-player/use-play-audiobook";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCardShell } from "@/components/books/book-card-shell";
import { BookContextMenu } from "@/components/books/book-context-menu";
import { useIsAudiobookLoading } from "@/context/audio-player-context";
import { useReaderRouteTo } from "@/lib/reader-engine-store";
import { m } from "@/paraglide/messages";
import {
	type CoverPreset,
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";

interface BookCardProps {
	uuid: string;
	title?: string | null;
	filename: string;
	cover: string | null;
	authors?: { id?: number | null; name: string }[];
	contextMenuEnabled?: boolean;
	priority?: boolean;
	coverPreset?: CoverPreset;
	progress?: number | null;
	mediaType?: "ebook" | "audiobook";
	compactTextBlock?: boolean;
}

export const BookCard = memo(function BookCard({
	uuid,
	title,
	filename,
	cover,
	authors,
	contextMenuEnabled = true,
	priority = false,
	coverPreset = coverPresets.card,
	progress,
	mediaType,
	compactTextBlock = false,
}: BookCardProps) {
	const isAudiobook = mediaType === "audiobook";
	const playAudiobook = usePlayAudiobook();
	const prefetchAudiobook = usePrefetchAudiobook();
	const isLoadingPlayback = useIsAudiobookLoading(uuid);
	const readerTo = useReaderRouteTo();
	const coverFilename = getCoverFilename(cover) ?? undefined;
	const displayTitle = title ?? filename;
	const authorText = formatNames(authors);
	const preloadedRef = useRef(false);
	const preloadOnIntent = useCallback(() => {
		if (isAudiobook) prefetchAudiobook(uuid);
		if (preloadedRef.current || !coverFilename) return;
		preloadedRef.current = true;
		const img = new Image();
		img.src = getCoverPresetUrl(coverFilename, coverPresets.detail);
	}, [isAudiobook, prefetchAudiobook, uuid, coverFilename]);
	const detailLinkProps = isAudiobook
		? ({
				to: "/dashboard/audiobooks/$uuid",
				params: { uuid },
				preload: "intent",
			} as const)
		: ({
				to: "/dashboard/books/$uuid",
				params: { uuid },
				preload: "intent",
			} as const);
	const overlay = (
		<div className="pointer-events-none absolute right-2 bottom-2 z-10 translate-y-3 opacity-0 transition-[opacity,translate] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
			{isAudiobook ? (
				<button
					type="button"
					data-pressable="strong"
					onClick={() => playAudiobook(uuid)}
					onPointerEnter={() => prefetchAudiobook(uuid)}
					onFocus={() => prefetchAudiobook(uuid)}
					disabled={isLoadingPlayback}
					aria-label={m["aria.listen_to"]({ title: displayTitle })}
					aria-busy={isLoadingPlayback}
					className="relative z-10 flex size-11 cursor-pointer items-center justify-center rounded-full bg-media-action shadow-black/30 shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[var(--press-scale)] disabled:cursor-default disabled:hover:scale-100"
				>
					{isLoadingPlayback ? (
						<CircleNotch className="size-5 animate-spin text-media-action-foreground" />
					) : (
						<Play className="size-5 text-media-action-foreground" />
					)}
				</button>
			) : (
				<Link
					to={readerTo}
					params={{ uuid }}
					data-pressable="strong"
					aria-label={m["aria.read_book"]({ title: displayTitle })}
					className="relative z-10 flex size-11 items-center justify-center rounded-full bg-media-action shadow-black/30 shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[var(--press-scale)]"
				>
					<BookOpen className="size-5 text-media-action-foreground" />
				</Link>
			)}
		</div>
	);

	const cardContent = (
		<BookCardShell
			linkProps={detailLinkProps}
			ariaLabel={displayTitle}
			onLinkMouseEnter={preloadOnIntent}
			coverFilename={coverFilename}
			coverPreset={coverPreset}
			square={isAudiobook}
			priority={priority}
			overlay={overlay}
			progress={progress}
			compactTextBlock={compactTextBlock}
			progressLabel={
				isAudiobook
					? m["aria.listening_progress"]()
					: m["aria.reading_progress"]()
			}
			title={displayTitle}
			subtitle={
				authorText ? (
					<AuthorLinkList
						authors={authors}
						linkClassName="transition-colors hover:text-foreground"
					/>
				) : undefined
			}
		/>
	);

	if (!contextMenuEnabled) {
		return cardContent;
	}

	return <BookContextMenu bookUuid={uuid}>{cardContent}</BookContextMenu>;
});
