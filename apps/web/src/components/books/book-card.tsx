import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { memo } from "react";
import { BookContextMenu } from "@/components/books/book-context-menu";
import { getCoverSrcSet, getCoverUrl } from "@/utils/covers";

const BOOK_CARD_COVER_FALLBACK = { width: 640, height: 960 } as const;
const BOOK_CARD_COVER_SIZES =
	"(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16.7vw";

function getBookCardCoverSrcSet(coverFilename: string): string {
	return getCoverSrcSet(coverFilename, [
		{ width: 320, height: 480 },
		{ width: 220, height: 330 },
		{ width: 420, height: 630 },
		{ width: 640, height: 960 },
		{ width: 840, height: 1260 },
		{ width: 1080, height: 1620 },
		{ width: 1280, height: 1920 },
	] as const);
}

interface BookCardProps {
	uuid: string;
	title?: string | null;
	titleHtml?: string;
	filename: string;
	cover: string | null;
	authors?: { name: string }[];
	contextMenuEnabled?: boolean;
	priority?: boolean;
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
}: BookCardProps) {
	const coverFilename = cover?.split("/").pop();
	const displayTitle = title ?? filename;
	const authorText = authors?.map((a) => a.name).join(", ");
	const cardContent = (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid }}
			className="group flex flex-col gap-2 rounded-lg p-2 transition-all"
		>
			<div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-white/[0.03] transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-black/40 group-hover:shadow-xl">
				{coverFilename ? (
					<img
						src={getCoverUrl(coverFilename, BOOK_CARD_COVER_FALLBACK)}
						srcSet={getBookCardCoverSrcSet(coverFilename)}
						sizes={BOOK_CARD_COVER_SIZES}
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
				{/* Hover scrim + overlay button */}
				<div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
				<div className="absolute right-2 bottom-2 translate-y-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
					<div className="flex size-10 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 transition-transform hover:scale-110 active:scale-95">
						<BookOpen className="size-5 text-primary-foreground" />
					</div>
				</div>
			</div>
			<div className="min-w-0 space-y-0.5 px-0.5">
				{titleHtml ? (
					<p
						className="line-clamp-2 font-medium text-sm leading-tight [&>em]:font-bold [&>em]:text-primary [&>em]:not-italic"
						dangerouslySetInnerHTML={{ __html: titleHtml }}
					/>
				) : (
					<p className="line-clamp-2 font-medium text-sm leading-tight">
						{displayTitle}
					</p>
				)}
				{authorText && (
					<p className="line-clamp-1 text-muted-foreground text-xs">
						{authorText}
					</p>
				)}
			</div>
		</Link>
	);

	if (!contextMenuEnabled) {
		return cardContent;
	}

	return <BookContextMenu bookUuid={uuid}>{cardContent}</BookContextMenu>;
});
