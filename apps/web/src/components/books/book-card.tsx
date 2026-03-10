import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { memo, type ReactNode } from "react";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookContextMenu } from "@/components/books/book-context-menu";
import {
	type CoverPreset,
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";

const EM_TAG_RE = /(<\/?em>)/g;

function renderHighlightedTitle(titleHtml: string) {
	const parts = titleHtml.split(EM_TAG_RE);
	let isEmphasis = false;
	let keyCounter = 0;
	const nodes: ReactNode[] = [];

	for (const part of parts) {
		if (part === "<em>") {
			isEmphasis = true;
			continue;
		}
		if (part === "</em>") {
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
}: BookCardProps) {
	const coverFilename = cover?.split("/").pop();
	const displayTitle = title ?? filename;
	const authorText = authors?.map((a) => a.name).join(", ");
	const detailLinkProps = {
		to: "/dashboard/books/$uuid",
		params: { uuid },
	} as const;
	const readerLinkProps = {
		to: "/dashboard/books/$uuid/read",
		params: { uuid },
	} as const;
	const cardContent = (
		<div className="group relative flex flex-col gap-2 rounded-lg p-2 transition-all">
			<Link
				{...detailLinkProps}
				aria-label={displayTitle}
				className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
			/>
			<div className="pointer-events-none relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted shadow-black/20 shadow-md ring-1 ring-white/[0.03] transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-2xl group-hover:shadow-black/40">
				{coverFilename ? (
					<img
						src={getCoverPresetUrl(coverFilename, coverPreset)}
						srcSet={getCoverSrcSet(coverFilename, coverPreset.widths)}
						sizes={coverPreset.sizes}
						alt={displayTitle}
						className="h-full w-full object-cover"
						loading={priority ? "eager" : "lazy"}
						fetchPriority={priority ? "high" : "auto"}
						decoding="async"
						width={160}
						height={240}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
						No cover
					</div>
				)}
				<div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
				<div className="pointer-events-auto absolute right-2 bottom-2 z-10 translate-y-3 opacity-0 transition-all duration-300 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100">
					<Link
						{...readerLinkProps}
						aria-label={`Read ${displayTitle}`}
						className="flex size-10 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/40 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95"
					>
						<BookOpen className="size-5 text-primary-foreground" />
					</Link>
				</div>
			</div>
		<div className="min-w-0 space-y-0.5 px-0.5">
			<div className="pointer-events-none">
				{titleHtml ? (
					<p className="line-clamp-2 font-medium text-sm leading-tight [&>em]:font-bold [&>em]:text-primary [&>em]:not-italic">
						{renderHighlightedTitle(titleHtml)}
					</p>
				) : (
					<p className="line-clamp-2 font-medium text-sm leading-tight">
						{displayTitle}
					</p>
				)}
			</div>
			{authorText && (
				<p className="relative z-10 line-clamp-1 text-muted-foreground text-xs">
					<AuthorLinkList
						authors={authors}
						linkClassName="transition-colors hover:text-foreground"
					/>
				</p>
			)}
		</div>
		</div>
	);

	if (!contextMenuEnabled) {
		return cardContent;
	}

	return <BookContextMenu bookUuid={uuid}>{cardContent}</BookContextMenu>;
});
