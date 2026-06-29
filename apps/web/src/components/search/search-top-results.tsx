import { Link } from "@tanstack/react-router";
import { Library, User } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";

type AuthorHit = { id: number; name: string; bookCount: number };

type SeriesHit = {
	id: number;
	name: string;
	bookCount: number;
	cover: string | null;
	author?: { id: number; name: string } | null;
};

type BookHit = {
	uuid: string;
	title?: string | null;
	filename: string;
	cover: string | null;
	authors?: { id?: number | null; name: string }[] | null;
};

type TopItem =
	| { kind: "author"; key: string; item: AuthorHit }
	| { kind: "series"; key: string; item: SeriesHit }
	| { kind: "book"; key: string; item: BookHit };

interface SearchTopResultsProps {
	query: string;
	authors: AuthorHit[];
	series: SeriesHit[];
	books: BookHit[];
}

const TOP_GRID_COUNT = 6;

// Exact name match beats prefix beats substring; everything else is a weak
// fallback (the hit matched on description, not title). On ties, books rank
// ahead of series ahead of authors since books are the catalog's primary content.
function nameScore(name: string, query: string): number {
	const n = name.toLowerCase();
	const q = query.toLowerCase();
	if (!q) return 0;
	if (n === q) return 3;
	if (n.startsWith(q)) return 2;
	if (n.includes(q)) return 1;
	return 0;
}

function buildTopItems(
	query: string,
	authors: AuthorHit[],
	series: SeriesHit[],
	books: BookHit[],
): TopItem[] {
	const ranked: { item: TopItem; score: number; priority: number }[] = [];
	for (const b of books) {
		ranked.push({
			item: { kind: "book", key: `book-${b.uuid}`, item: b },
			score: nameScore(b.title ?? b.filename, query),
			priority: 2,
		});
	}
	for (const s of series) {
		ranked.push({
			item: { kind: "series", key: `series-${s.id}`, item: s },
			score: nameScore(s.name, query),
			priority: 1,
		});
	}
	for (const a of authors) {
		ranked.push({
			item: { kind: "author", key: `author-${a.id}`, item: a },
			score: nameScore(a.name, query),
			priority: 0,
		});
	}
	ranked.sort((a, b) => b.score - a.score || b.priority - a.priority);
	return ranked.slice(0, TOP_GRID_COUNT).map((r) => r.item);
}

const CARD_CLASS =
	"group flex items-center gap-5 rounded-xl border border-border/50 bg-card/30 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

const MEDIA_WRAP_CLASS = "flex w-24 shrink-0 items-center justify-center";

function CardText({ title, subtitle }: { title: string; subtitle: string }) {
	return (
		<div className="min-w-0 flex-1">
			<p className="line-clamp-2 font-medium text-lg leading-snug">{title}</p>
			<p className="mt-1 truncate text-muted-foreground text-sm">{subtitle}</p>
		</div>
	);
}

function PortraitCover({
	cover,
	alt,
	fallback,
}: {
	cover: string | null;
	alt: string;
	fallback: ReactNode;
}) {
	const filename = getCoverFilename(cover);
	return (
		<div className="aspect-[2/3] h-28 overflow-hidden rounded-md bg-muted shadow-black/20 shadow-sm">
			{filename ? (
				<img
					src={getCoverPresetUrl(filename, coverPresets.small)}
					srcSet={getCoverSrcSet(filename, coverPresets.small.widths)}
					sizes="96px"
					alt={alt}
					className="h-full w-full object-cover"
					loading="lazy"
					decoding="async"
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
					{fallback}
				</div>
			)}
		</div>
	);
}

function TopResultCard({ entry }: { entry: TopItem }) {
	if (entry.kind === "author") {
		const a = entry.item;
		return (
			<Link
				to="/dashboard/authors/$authorId"
				params={{ authorId: String(a.id) }}
				preload="intent"
				className={CARD_CLASS}
			>
				<div className={MEDIA_WRAP_CLASS}>
					<div className="flex size-24 items-center justify-center rounded-full bg-muted">
						<User className="size-11 text-muted-foreground/50" />
					</div>
				</div>
				<CardText title={a.name} subtitle="Author" />
			</Link>
		);
	}

	if (entry.kind === "series") {
		const s = entry.item;
		return (
			<Link
				to="/dashboard/series/$seriesName"
				params={{ seriesName: s.name }}
				preload="intent"
				className={CARD_CLASS}
			>
				<div className={MEDIA_WRAP_CLASS}>
					<PortraitCover
						cover={s.cover}
						alt={s.name}
						fallback={<Library className="size-7" />}
					/>
				</div>
				<CardText
					title={s.name}
					subtitle={s.author ? `Series · ${s.author.name}` : "Series"}
				/>
			</Link>
		);
	}

	const b = entry.item;
	const displayTitle = b.title ?? b.filename;
	const authorText = formatNames(b.authors ?? undefined);
	return (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid: b.uuid }}
			preload="intent"
			className={CARD_CLASS}
		>
			<div className={MEDIA_WRAP_CLASS}>
				<PortraitCover
					cover={b.cover}
					alt={displayTitle}
					fallback={<span className="text-[9px]">No cover</span>}
				/>
			</div>
			<CardText
				title={displayTitle}
				subtitle={authorText ? `Book · ${authorText}` : "Book"}
			/>
		</Link>
	);
}

const TOP_GRID_CLASS = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";
const SKELETON_KEYS = ["tr-1", "tr-2", "tr-3", "tr-4", "tr-5", "tr-6"];

export function SearchTopResultsSkeleton() {
	return (
		<section className="space-y-3">
			<h2 className="font-semibold text-xl">Top results</h2>
			<div className={TOP_GRID_CLASS} aria-busy="true">
				{SKELETON_KEYS.map((key) => (
					<div
						key={key}
						className="flex items-center gap-5 rounded-xl border border-border/50 bg-card/30 p-4"
					>
						<div className={MEDIA_WRAP_CLASS}>
							<Skeleton className="aspect-[2/3] h-28 rounded-md" />
						</div>
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-4 w-3/4 rounded" />
							<Skeleton className="h-3 w-2/5 rounded" />
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

export function SearchTopResults({
	query,
	authors,
	series,
	books,
}: SearchTopResultsProps) {
	const items = buildTopItems(query, authors, series, books);
	if (items.length === 0) return null;

	return (
		<section className="space-y-3">
			<h2 className="font-semibold text-xl">Top results</h2>
			<div className={TOP_GRID_CLASS}>
				{items.map((entry) => (
					<TopResultCard key={entry.key} entry={entry} />
				))}
			</div>
		</section>
	);
}
