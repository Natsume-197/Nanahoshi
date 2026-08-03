import { isReaderSupportedEbook } from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import { BookOpen, CircleNotch, Play } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { memo, type ReactNode, useCallback, useRef } from "react";
import {
	usePlayAudiobook,
	usePrefetchAudiobook,
} from "@/components/audio-player/use-play-audiobook";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCardShell } from "@/components/books/book-card-shell";
import { BookContextMenu } from "@/components/books/book-context-menu";
import { useIsAudiobookLoading } from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
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
	/** Native square frame for uniform audiobook carousels. */
	coverFrameRatio?: "book" | "square";
	compactTextBlock?: boolean;
	orientation?: "vertical" | "horizontal";
	/** Extra muted line under the authors. Horizontal orientation only. */
	meta?: ReactNode;
	/** Cover's dominant color; tints the card surface. Horizontal only. */
	tint?: string | null;
	/** Makes the whole card immediately open or play the item. */
	primaryAction?: "details" | "consume";
	/** Shows the hover action over the cover. */
	showOverlayAction?: boolean;
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
	coverFrameRatio = "book",
	compactTextBlock = false,
	orientation = "vertical",
	meta,
	tint,
	primaryAction = "details",
	showOverlayAction = true,
}: BookCardProps) {
	const isAudiobook = mediaType === "audiobook";
	const isReaderSupported = !isAudiobook && isReaderSupportedEbook(filename);
	const playAudiobook = usePlayAudiobook();
	const prefetchAudiobook = usePrefetchAudiobook();
	const isLoadingPlayback = useIsAudiobookLoading(uuid);
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
	const consumeLinkProps = {
		to: "/reader/$uuid",
		params: { uuid },
		preload: "intent",
	} as const;
	const consumesOnCardClick =
		primaryAction === "consume" && (isAudiobook || isReaderSupported);
	const usesImmediatePlayback = consumesOnCardClick && isAudiobook;
	const primaryLinkProps =
		consumesOnCardClick && !isAudiobook ? consumeLinkProps : detailLinkProps;
	// The small cover of a horizontal card can't host the full-size action, so it
	// takes a scaled-down one tucked into the corner.
	const isCompactAction = orientation === "horizontal";
	const actionSizeClass = isCompactAction ? "size-8" : "size-11";
	const actionIconClass = isCompactAction ? "size-4" : "size-5";
	const showsOverlay = showOverlayAction && (isAudiobook || isReaderSupported);
	const overlay = showsOverlay ? (
		<div
			className={cn(
				"pointer-events-none absolute z-10 translate-y-3 opacity-0 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 motion-safe:transition-[opacity,translate] motion-safe:duration-[var(--duration-quick)] motion-safe:ease-[var(--ease-smooth-out)]",
				isCompactAction ? "end-2.5 bottom-2.5" : "end-2 bottom-2",
			)}
		>
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
					className={cn(
						"relative z-10 flex cursor-pointer items-center justify-center rounded-full bg-media-action shadow-black/30 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default disabled:hover:scale-100 motion-safe:transition-transform motion-safe:active:scale-[var(--press-scale)] motion-safe:hover:scale-105",
						actionSizeClass,
					)}
				>
					{isLoadingPlayback ? (
						<CircleNotch
							aria-hidden="true"
							className={cn(
								"animate-spin text-media-action-foreground",
								actionIconClass,
							)}
						/>
					) : (
						<Play
							aria-hidden="true"
							className={cn(
								"translate-x-0.5 text-media-action-foreground",
								actionIconClass,
							)}
						/>
					)}
				</button>
			) : (
				<Link
					to="/reader/$uuid"
					params={{ uuid }}
					data-pressable="strong"
					aria-label={m["aria.read_book"]({ title: displayTitle })}
					className={cn(
						"relative z-10 flex items-center justify-center rounded-full bg-media-action shadow-black/30 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-safe:transition-transform motion-safe:active:scale-[var(--press-scale)] motion-safe:hover:scale-105",
						actionSizeClass,
					)}
				>
					<BookOpen
						aria-hidden="true"
						className={cn("text-media-action-foreground", actionIconClass)}
					/>
				</Link>
			)}
		</div>
	) : undefined;

	const cardContent = (
		<BookCardShell
			linkProps={primaryLinkProps}
			ariaLabel={
				consumesOnCardClick
					? isAudiobook
						? m["aria.listen_to"]({ title: displayTitle })
						: m["aria.read_book"]({ title: displayTitle })
					: displayTitle
			}
			onLinkMouseEnter={preloadOnIntent}
			onCardAction={
				usesImmediatePlayback ? () => playAudiobook(uuid) : undefined
			}
			cardActionAriaLabel={m["aria.listen_to"]({ title: displayTitle })}
			fullCardAction={consumesOnCardClick}
			coverFilename={coverFilename}
			coverPreset={coverPreset}
			square={isAudiobook}
			coverFrameRatio={coverFrameRatio}
			priority={priority}
			overlay={overlay}
			progress={progress}
			compactTextBlock={compactTextBlock}
			orientation={orientation}
			meta={meta}
			tint={tint}
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
						linkClassName={cn(
							"transition-colors",
							isCompactAction ? "hover:text-current" : "hover:text-foreground",
						)}
						separatorClassName={isCompactAction ? "text-current" : undefined}
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
