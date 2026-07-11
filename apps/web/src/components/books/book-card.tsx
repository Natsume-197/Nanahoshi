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
import { m } from "@/paraglide/messages";
import {
	type CoverPreset,
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";

const HIGHLIGHT_TAG_RE = /(<em>|<\/em>|<span class="keyword">|<\/span>)/g;

function renderHighlightedTitle(titleHtml: string) {
	const parts = titleHtml.split(HIGHLIGHT_TAG_RE);
	let isEmphasis = false;
	let keyCounter = 0;
	const nodes: ReactNode[] = [];

	for (const part of parts) {
		if (part === "<em>" || part === '<span class="keyword">') {
			isEmphasis = true;
			continue;
		}
		if (part === "</em>" || part === "</span>") {
			isEmphasis = false;
			continue;
		}
		if (!part) {
			continue;
		}

		nodes.push(
			isEmphasis ? (
				<em key={`title-part-${keyCounter}`}>{part}</em>
			) : (
				<span key={`title-part-${keyCounter}`}>{part}</span>
			),
		);
		keyCounter += 1;
	}

	return nodes;
}

interface BookCardProps {
	uuid: string;
	title?: string | null;
	titleHtml?: string;
	filename: string;
	cover: string | null;
	authors?: { id?: number | null; name: string }[];
	contextMenuEnabled?: boolean;
	priority?: boolean;
	coverPreset?: CoverPreset;
	progress?: number | null;
	mediaType?: "ebook" | "audiobook";
}

export const BookCard = memo(function BookCard({
	uuid,
	title,
	titleHtml,
	filename,
	cover,
	authors,
	contextMenuEnabled = true,
	priority = false,
	coverPreset = coverPresets.card,
	progress,
	mediaType,
}: BookCardProps) {
	const isAudiobook = mediaType === "audiobook";
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
	const overlay = (
		<div className="pointer-events-auto absolute right-2 bottom-2 z-10 translate-y-2 opacity-0 transition-[opacity,translate] duration-300 ease-out-quint focus-within:translate-y-0 focus-within:opacity-100 focus-within:transition-none group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:translate-y-0">
			{isAudiobook ? (
				<button
					type="button"
					onClick={() => playAudiobook(uuid)}
					onPointerEnter={() => prefetchAudiobook(uuid)}
					onFocus={() => prefetchAudiobook(uuid)}
					disabled={isLoadingPlayback}
					aria-label={m["aria.listen_to"]({ title: displayTitle })}
					aria-busy={isLoadingPlayback}
					className="media-action-interaction relative z-10 flex size-10 cursor-pointer items-center justify-center rounded-full bg-media-action shadow-black/30 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default"
				>
					{isLoadingPlayback ? (
						<CircleNotch className="size-5 animate-spin text-media-action-foreground" />
					) : (
						<Play className="size-5 text-media-action-foreground" />
					)}
				</button>
			) : (
				<Link
					to="/reader/$uuid"
					params={{ uuid }}
					aria-label={m["aria.read_book"]({ title: displayTitle })}
					className="media-action-interaction relative z-10 flex size-10 items-center justify-center rounded-full bg-media-action shadow-black/30 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
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
			progressLabel={
				isAudiobook
					? m["aria.listening_progress"]()
					: m["aria.reading_progress"]()
			}
			title={titleHtml ? renderHighlightedTitle(titleHtml) : displayTitle}
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
