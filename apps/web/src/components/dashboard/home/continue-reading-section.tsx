import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import type { JSX } from "react";
import { ScrollSection } from "@/components/shared/scroll-section";
import { getCoverSrcSet, getCoverUrl } from "@/utils/covers";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";

export type ContinueReadingEntry = {
	bookUuid: string;
	bookFilename: string;
	title: string | null;
	cover: string | null;
	mainColor?: string | null;
	exploredCharCount: number | null;
	bookCharCount: number | null;
};

type ContinueReadingSectionProps = {
	entries: ContinueReadingEntry[];
};

type ContinueReadingCardProps = {
	entry: ContinueReadingEntry;
	priority?: boolean;
};

const CONTINUE_READING_COVER_FALLBACK = { width: 220, height: 330 } as const;
const CONTINUE_READING_COVER_VARIANTS = [
	{ width: 140, height: 210 },
	{ width: 160, height: 240 },
	{ width: 220, height: 330 },
	{ width: 320, height: 480 },
] as const;
const CONTINUE_READING_COVER_SIZES = "(max-width: 640px) 140px, 160px";

export function ContinueReadingSection({
	entries,
}: ContinueReadingSectionProps): JSX.Element | null {
	if (entries.length === 0) {
		return null;
	}

	return (
		<ScrollSection title="Continue reading">
			{entries.map((entry, index) => (
				<DashboardContextMenuBook
					key={entry.bookUuid}
					bookUuid={entry.bookUuid}
				>
					<ContinueReadingCard entry={entry} priority={index === 0} />
				</DashboardContextMenuBook>
			))}
		</ScrollSection>
	);
}

function ContinueReadingCard({
	entry,
	priority = false,
}: ContinueReadingCardProps): JSX.Element {
	const coverFilename = entry.cover?.split("/").pop();
	const displayTitle = entry.title ?? entry.bookFilename;
	const progress =
		entry.bookCharCount && entry.bookCharCount > 0
			? Math.min(
					Math.round(
						((entry.exploredCharCount ?? 0) / entry.bookCharCount) * 100,
					),
					100,
				)
			: 0;

	return (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid: entry.bookUuid }}
			className="group flex flex-col gap-2 rounded-lg p-2 transition-all"
		>
			<div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-white/[0.03] transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-black/40 group-hover:shadow-xl">
				{coverFilename ? (
					<img
						src={getCoverUrl(coverFilename, CONTINUE_READING_COVER_FALLBACK)}
						srcSet={getCoverSrcSet(
							coverFilename,
							CONTINUE_READING_COVER_VARIANTS,
						)}
						sizes={CONTINUE_READING_COVER_SIZES}
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
				<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-2.5 pt-8">
					<div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
						<div
							className="h-full rounded-full bg-primary transition-all"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<p className="mt-1 text-right font-medium text-[11px] text-white/80">
						{progress}%
					</p>
				</div>
				<div className="absolute right-2 bottom-12 translate-y-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
					<div className="flex size-10 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 transition-transform hover:scale-110 active:scale-95">
						<BookOpen className="size-5 text-primary-foreground" />
					</div>
				</div>
			</div>
			<div className="min-w-0 space-y-0.5 px-0.5">
				<p className="line-clamp-2 font-medium text-sm leading-tight">
					{displayTitle}
				</p>
			</div>
		</Link>
	);
}
