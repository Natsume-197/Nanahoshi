import type { TopHit } from "@nanahoshi-v2/api/routers/search/search.model";
import { Books, FolderOpen, User } from "@phosphor-icons/react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";
import { HitLink } from "./top-results-hit-link";

const LIST_HITS = 5;
const LIST_SKELETON_KEYS = ["top-sk-1", "top-sk-2", "top-sk-3", "top-sk-4"];

function hitKey(hit: TopHit): string {
	switch (hit.type) {
		case "book":
		case "audiobook":
			return `${hit.type}-${hit.uuid}`;
		case "series":
		case "author":
			return `${hit.type}-${hit.uuid}`;
		case "collection":
			return `${hit.type}-${hit.id}`;
		case "user":
			return `user-${hit.username}`;
	}
}

function hitTitle(hit: TopHit): string {
	switch (hit.type) {
		case "book":
		case "audiobook":
			return hit.title ?? hit.filename;
		case "series":
		case "author":
		case "collection":
			return hit.name;
		case "user":
			return hit.displayUsername ?? hit.name;
	}
}

function hitSubtitle(hit: TopHit): string {
	switch (hit.type) {
		case "book":
		case "audiobook": {
			const typeLabel =
				hit.type === "book" ? m["media.book"]() : m["media.audiobook"]();
			const authorText = formatNames(hit.authors);
			return authorText ? `${typeLabel} · ${authorText}` : typeLabel;
		}
		case "series": {
			const count = m["media.book_count"]({ count: hit.bookCount });
			return hit.author
				? `${m["nav.series"]()} · ${hit.author.name} · ${count}`
				: `${m["nav.series"]()} · ${count}`;
		}
		case "author":
			return `${m["common.author"]()} · ${m["media.book_count"]({ count: hit.bookCount })}`;
		case "collection":
			return m["search.collection_by"]({ username: hit.ownerUsername ?? "" });
		case "user":
			return `@${hit.username}`;
	}
}

// Author/user hits render as circular portraits everywhere; the rest as covers.
function isPortraitHit(hit: TopHit): boolean {
	return hit.type === "author" || hit.type === "user";
}

function hitCover(hit: TopHit): string | null {
	switch (hit.type) {
		case "book":
		case "audiobook":
		case "series":
			return hit.cover;
		case "collection":
			return hit.previewCovers[0] ?? null;
		default:
			return null;
	}
}

function fallbackIcon(hit: TopHit, className: string) {
	switch (hit.type) {
		case "series":
			return <Books className={className} />;
		case "collection":
			return <FolderOpen className={className} />;
		default:
			return <User className={className} />;
	}
}

function HeroVisual({ hit }: { hit: TopHit }) {
	if (isPortraitHit(hit)) {
		if (hit.type === "user") {
			return (
				<UserAvatar
					name={hit.displayUsername ?? hit.name}
					image={hit.image}
					className="size-28 shadow-black/30 shadow-lg sm:size-32"
				/>
			);
		}
		return (
			<div className="flex size-28 items-center justify-center rounded-full bg-muted shadow-black/30 shadow-lg sm:size-32">
				<User className="size-12 text-muted-foreground/50" />
			</div>
		);
	}
	const filename = getCoverFilename(hitCover(hit));
	const square = hit.type === "audiobook";
	return (
		<div
			className={
				square
					? "flex aspect-square w-28 items-center justify-center overflow-hidden rounded-md bg-muted shadow-black/30 shadow-lg sm:w-32"
					: "flex aspect-[2/3] w-28 items-center justify-center overflow-hidden rounded-md bg-muted shadow-black/30 shadow-lg sm:w-32"
			}
		>
			{filename ? (
				<img
					src={getCoverPresetUrl(filename, coverPresets.small)}
					srcSet={getCoverSrcSet(filename, coverPresets.small.widths)}
					sizes="(max-width: 640px) 112px, 128px"
					alt=""
					className="h-full w-full object-cover"
					decoding="async"
					width={140}
					height={square ? 140 : 210}
				/>
			) : (
				fallbackIcon(hit, "size-8 text-muted-foreground/50")
			)}
		</div>
	);
}

function ListVisual({ hit }: { hit: TopHit }) {
	if (hit.type === "user") {
		return (
			<UserAvatar
				name={hit.displayUsername ?? hit.name}
				image={hit.image}
				className="size-12 shrink-0"
			/>
		);
	}
	if (hit.type === "author") {
		return (
			<div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
				<User className="size-5 text-muted-foreground/50" />
			</div>
		);
	}
	const filename = getCoverFilename(hitCover(hit));
	return (
		<div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
			{filename ? (
				<img
					src={getCoverPresetUrl(filename, coverPresets.thumbnail)}
					srcSet={getCoverSrcSet(filename, coverPresets.thumbnail.widths)}
					sizes="96px"
					alt=""
					className="h-full w-full object-cover"
					loading="lazy"
					decoding="async"
					width={80}
					height={120}
				/>
			) : (
				fallbackIcon(hit, "size-5 text-muted-foreground/50")
			)}
		</div>
	);
}

function TopResultsSkeleton() {
	return (
		<section className="flex flex-col gap-3" aria-busy="true">
			<h2 className="text-balance font-semibold text-xl">
				{m["search.top_results"]()}
			</h2>
			<div className="grid gap-3 md:grid-cols-[minmax(260px,340px)_1fr]">
				<div className="rounded-xl bg-muted/40 p-5">
					<Skeleton className="aspect-[2/3] w-28 rounded-md sm:w-32" />
					<Skeleton className="mt-4 h-6 w-3/4 rounded" />
					<Skeleton className="mt-2 h-4 w-1/2 rounded" />
				</div>
				<div className="flex flex-col gap-1">
					{LIST_SKELETON_KEYS.map((key) => (
						<div key={key} className="flex items-center gap-3 px-3 py-2">
							<Skeleton className="size-12 shrink-0 rounded-md" />
							<div className="flex min-w-0 flex-1 flex-col gap-1.5">
								<Skeleton className="h-4 w-2/3 rounded" />
								<Skeleton className="h-3 w-2/5 rounded" />
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

// Hits arrive ranked from the search page (client-side re-rank of the section
// queries it already fetched) so this section costs zero extra requests.
export function TopResultsSection({
	hits,
	isLoading,
}: {
	hits: TopHit[];
	isLoading: boolean;
}) {
	if (isLoading) return <TopResultsSkeleton />;
	if (hits.length === 0) return null;

	const [topHit, ...rest] = hits;
	const listHits = rest.slice(0, LIST_HITS);

	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-balance font-semibold text-xl">
				{m["search.top_results"]()}
			</h2>
			<div className="grid gap-3 md:grid-cols-[minmax(260px,340px)_1fr]">
				<HitLink
					hit={topHit}
					className="group flex min-w-0 flex-col justify-end rounded-xl bg-muted/40 p-5 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					<HeroVisual hit={topHit} />
					<p className="mt-4 line-clamp-2 font-bold text-xl leading-tight">
						{hitTitle(topHit)}
					</p>
					<p className="mt-1 truncate text-muted-foreground text-sm">
						{hitSubtitle(topHit)}
					</p>
				</HitLink>
				{listHits.length > 0 && (
					<div className="flex min-w-0 flex-col justify-center">
						{listHits.map((hit) => (
							<HitLink
								hit={hit}
								key={hitKey(hit)}
								className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
							>
								<ListVisual hit={hit} />
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sm">
										{hitTitle(hit)}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{hitSubtitle(hit)}
									</p>
								</div>
							</HitLink>
						))}
					</div>
				)}
			</div>
		</section>
	);
}
