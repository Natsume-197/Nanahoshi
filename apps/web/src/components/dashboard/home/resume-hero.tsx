import { Link } from "@tanstack/react-router";
import { BookOpen, Headphones } from "lucide-react";
import { type JSX, memo } from "react";
import { AuthorLinkList } from "@/components/books/author-link-list";
import {
	CoverProgressBar,
	getHeroStyle,
} from "@/components/shared/detail-page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useResumeHero } from "@/hooks/books/use-resume-hero";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { setHeroBackdrop } from "@/lib/hero-backdrop-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";

export const ResumeHero = memo(function ResumeHero(): JSX.Element | null {
	const { hero, isLoading } = useResumeHero();

	if (isLoading) return <ResumeHeroSkeleton />;
	if (!hero) return null;

	const isAudiobook = hero.kind === "audiobook";
	const displayTitle = hero.title ?? hero.filename;
	const accent = hero.mainColor ?? null;

	const coverFilename = getCoverFilename(hero.cover);
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.detail)
		: null;
	const coverSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.detail.widths)
		: undefined;
	const backdropUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.small)
		: null;
	const backdropSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.small.widths)
		: undefined;

	const detailLink = isAudiobook
		? ({
				to: "/dashboard/audiobooks/$uuid",
				params: { uuid: hero.uuid },
			} as const)
		: ({ to: "/dashboard/books/$uuid", params: { uuid: hero.uuid } } as const);
	const playLink = isAudiobook
		? ({ to: "/player/$uuid", params: { uuid: hero.uuid } } as const)
		: ({ to: "/reader/$uuid", params: { uuid: hero.uuid } } as const);
	const ContinueIcon = isAudiobook ? Headphones : BookOpen;

	return (
		<>
			{/* Hand this book's color + cover to the layout, which paints one
			    continuous wash behind the navbar AND this hero (mirrors the book
			    detail page). Keyed by uuid so it republishes when the hero changes;
			    cleared on unmount (leaving home or nothing left in progress). */}
			<HeroBackdropPublisher
				key={hero.uuid}
				accent={accent}
				coverUrl={backdropUrl}
				coverSrcSet={backdropSrcSet}
			/>
			<section
				style={getHeroStyle(accent)}
				className="relative -mx-3 -mt-6 md:-mx-6 lg:-mx-8 lg:-mt-8"
			>
				<div className="relative flex items-center gap-4 px-3 py-5 max-[379px]:gap-3 sm:gap-7 md:px-6 md:py-8 lg:px-8">
					<Link
						{...detailLink}
						preload="intent"
						aria-label={displayTitle}
						className="block w-24 shrink-0 rounded-md shadow-xl transition-transform duration-500 ease-out hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 max-[379px]:w-20 sm:w-36"
					>
						<div
							className={cn(
								"relative overflow-hidden rounded-md bg-muted",
								isAudiobook ? "aspect-square" : "aspect-[2/3]",
							)}
						>
							{coverUrl ? (
								<img
									src={coverUrl}
									srcSet={coverSrcSet}
									sizes="(max-width: 379px) 80px, (max-width: 640px) 96px, 144px"
									alt=""
									className="h-full w-full object-cover"
									fetchPriority="high"
									decoding="async"
									width={144}
									height={isAudiobook ? 144 : 216}
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center text-center text-[10px] text-muted-foreground sm:text-xs">
									{m["book.no_cover"]()}
								</div>
							)}
							<CoverProgressBar
								percentage={hero.progress}
								accentColor={accent}
							/>
						</div>
					</Link>

					<div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 sm:gap-2">
						<Link
							{...detailLink}
							preload="intent"
							className="max-w-full text-balance font-bold text-2xl text-[var(--book-hero-text)] leading-tight tracking-tight transition-opacity hover:opacity-80 focus-visible:opacity-80 focus-visible:outline-none max-[379px]:text-xl sm:text-3xl"
						>
							<span className="line-clamp-2">{displayTitle}</span>
						</Link>

						{hero.authors.length > 0 && (
							<div className="max-w-full overflow-hidden text-[var(--book-hero-muted)] text-sm">
								<AuthorLinkList
									authors={hero.authors}
									className="max-w-full flex-nowrap overflow-hidden whitespace-nowrap"
									linkClassName="transition-colors hover:text-[var(--book-hero-text)]"
								/>
							</div>
						)}

						<div className="mt-2 w-full min-w-0 sm:mt-3 sm:w-auto">
							<Button
								asChild
								className="h-10 w-full min-w-0 max-w-full shrink gap-1.5 rounded-md border-0 px-4 font-semibold text-sm hover:brightness-105 sm:h-11 sm:w-auto sm:px-5"
								style={
									accent
										? {
												backgroundColor: "var(--book-accent)",
												color: "var(--book-accent-foreground)",
											}
										: undefined
								}
							>
								<Link {...playLink} preload="intent">
									<ContinueIcon className="size-3.5 shrink-0" />
									<span className="min-w-0 truncate">
										{m["home.hero_continue"]()}
									</span>
									{hero.progress > 0 && (
										<span className="shrink-0 tabular-nums opacity-80">
											· {hero.progress}%
										</span>
									)}
								</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>
		</>
	);
});

function HeroBackdropPublisher({
	accent,
	coverUrl,
	coverSrcSet,
}: {
	accent: string | null;
	coverUrl: string | null;
	coverSrcSet?: string;
}): null {
	useMountEffect(() => {
		setHeroBackdrop({ accent, coverUrl, coverSrcSet });
		return () => setHeroBackdrop(null);
	});
	return null;
}

function ResumeHeroSkeleton(): JSX.Element {
	return (
		<div className="-mx-3 -mt-6 flex items-center gap-4 px-3 py-5 max-[379px]:gap-3 sm:gap-7 md:-mx-6 md:px-6 md:py-8 lg:-mx-8 lg:-mt-8 lg:px-8">
			<Skeleton className="aspect-[2/3] w-24 shrink-0 rounded-md max-[379px]:w-20 sm:w-36" />
			<div className="flex w-full min-w-0 flex-1 flex-col gap-3">
				<Skeleton className="h-4 w-28 rounded" />
				<Skeleton className="h-8 w-3/4 rounded" />
				<Skeleton className="h-4 w-40 rounded" />
				<Skeleton className="mt-2 h-10 w-full rounded-md sm:mt-3 sm:h-11 sm:w-40" />
			</div>
		</div>
	);
}
