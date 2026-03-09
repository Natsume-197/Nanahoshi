import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { type JSX, memo } from "react";
import { ScrollSection } from "@/components/shared/scroll-section";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
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

export const ContinueReadingSection = memo(function ContinueReadingSection({
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
});

const ContinueReadingCard = memo(function ContinueReadingCard({
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
	const detailLinkProps = {
		to: "/dashboard/books/$uuid",
		params: { uuid: entry.bookUuid },
	} as const;
	const readerLinkProps = {
		to: "/dashboard/books/$uuid/read",
		params: { uuid: entry.bookUuid },
	} as const;

	return (
		<div className="group relative flex flex-col gap-2 rounded-lg p-2 transition-all">
			<Link
				{...detailLinkProps}
				aria-label={displayTitle}
				className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
			/>
			<div className="pointer-events-none relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted shadow-black/20 shadow-md ring-1 ring-white/[0.03] transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-2xl group-hover:shadow-black/40">
				{coverFilename ? (
					<img
						src={getCoverPresetUrl(coverFilename, coverPresets.small)}
						srcSet={getCoverSrcSet(coverFilename, coverPresets.small.widths)}
						sizes={coverPresets.small.sizes}
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
				<div className="pointer-events-auto absolute right-2 bottom-12 z-10 translate-y-3 opacity-0 transition-all duration-300 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100">
					<Link
						{...readerLinkProps}
						aria-label={`Read ${displayTitle}`}
						className="flex size-10 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/40 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95"
					>
						<BookOpen className="size-5 text-primary-foreground" />
					</Link>
				</div>
			</div>
			<div className="pointer-events-none min-w-0 space-y-0.5 px-0.5">
				<p className="line-clamp-2 font-medium text-sm leading-tight">
					{displayTitle}
				</p>
			</div>
		</div>
	);
});
