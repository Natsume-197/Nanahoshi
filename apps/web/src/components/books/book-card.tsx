import { Link } from "@tanstack/react-router";
import { Download, Headphones } from "lucide-react";
import { memo, type ReactNode, useCallback, useRef } from "react";
import { toast } from "sonner";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCardShell } from "@/components/books/book-card-shell";
import { BookContextMenu } from "@/components/books/book-context-menu";
import { useCachedBookUuids } from "@/hooks/use-cached-books";
import {
	type CoverPreset,
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { client } from "@/utils/orpc";

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
	const cachedBookUuids = useCachedBookUuids();
	const coverFilename = getCoverFilename(cover) ?? undefined;
	const displayTitle = title ?? filename;
	const authorText = authors?.map((a) => a.name).join(", ");
	const preloadedRef = useRef(false);
	const preloadDetailCover = useCallback(() => {
		if (preloadedRef.current || !coverFilename) return;
		preloadedRef.current = true;
		const img = new Image();
		img.src = getCoverPresetUrl(coverFilename, coverPresets.detail);
	}, [coverFilename]);
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
	const handleDownload = useCallback(async () => {
		try {
			const { url } = await client.files.getSignedDownloadUrl({ uuid });
			window.open(url, "_blank", "noopener,noreferrer");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to download this book",
			);
		}
	}, [uuid]);
	const overlay = (
		<div className="pointer-events-auto absolute right-2 bottom-2 z-10 translate-y-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-has-[:focus-visible]:translate-y-0 group-has-[:focus-visible]:opacity-100">
			{isAudiobook ? (
				<Link
					to="/player/$uuid"
					params={{ uuid }}
					aria-label={`Listen to ${displayTitle}`}
					className="relative z-10 flex size-10 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/40 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95"
				>
					<Headphones className="size-5 text-primary-foreground" />
				</Link>
			) : (
				<button
					type="button"
					onClick={handleDownload}
					aria-label={`Download ${displayTitle}`}
					className="relative z-10 flex size-10 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/40 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95"
				>
					<Download className="size-5 text-primary-foreground" />
				</button>
			)}
		</div>
	);

	const cardContent = (
		<BookCardShell
			linkProps={detailLinkProps}
			ariaLabel={displayTitle}
			onLinkMouseEnter={preloadDetailCover}
			coverFilename={coverFilename}
			coverPreset={coverPreset}
			square={isAudiobook}
			priority={priority}
			overlay={overlay}
			availableOffline={!isAudiobook && cachedBookUuids.has(uuid)}
			progress={progress}
			progressLabel={isAudiobook ? "Listening progress" : "Reading progress"}
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
