import { type JSX, memo } from "react";
import { AuthorLinkList } from "@/components/books/author-link-list";
import { BookCardShell } from "@/components/books/book-card-shell";
import { SeriesContextMenu } from "@/components/series/series-context-menu";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets, getCoverFilename } from "@/utils/covers";
import {
	DASHBOARD_AUDIOBOOK_TILE_CLASS,
	DASHBOARD_BOOK_TILE_CLASS,
} from "./section-skeleton";

export type SeriesEntry = {
	uuid: string;
	name: string;
	count: number;
	cover: string | null;
	/** Dominant color of the cover book (hex), tints the stack backdrop. */
	color?: string | null;
	author?: { id: number; uuid?: string; name: string } | null;
};

// Spotify-style "stack of sheets" behind the cover: two inset layers peeking
// above the frame, tinted with the cover's dominant color. Mixed in oklab so
// tints stay clean in both themes; neutral surfaces when no color is known.
function SeriesStackBackdrop({ color }: { color?: string | null }) {
	const tint = (pct: number) =>
		color
			? {
					backgroundColor: `color-mix(in oklab, ${color} ${pct}%, var(--card))`,
				}
			: undefined;
	return (
		<>
			<span
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 -translate-y-2 scale-x-[0.87] rounded-md bg-muted ring-1 ring-border/60"
				style={tint(50)}
			/>
			<span
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 -translate-y-1 scale-x-[0.94] rounded-md bg-card ring-1 ring-border/50"
				style={tint(80)}
			/>
		</>
	);
}

type SeriesSectionProps = {
	title: string;
	showAllHref?: string;
	showAllState?: Record<string, unknown>;
	seriesDetailPath: string;
	series: SeriesEntry[];
	/** Carousel scroll-restoration id (see ScrollSection.restoreId). */
	restoreId?: string;
	aspectRatio?: "square" | "book";
	/** Localized "{count} book(s)" plural message (e.g. m.home_series_book_count). */
	countMessage: (inputs: { count: number }) => string;
};

export const SeriesSection = memo(function SeriesSection({
	title,
	showAllHref,
	showAllState,
	seriesDetailPath,
	series,
	restoreId,
	aspectRatio = "book",
	countMessage,
}: SeriesSectionProps): JSX.Element | null {
	if (series.length === 0) {
		return null;
	}

	const showAuthor = series.some((s) => s.author);

	return (
		<ScrollSection
			title={title}
			showAllHref={showAllHref}
			showAllState={showAllState}
			restoreId={restoreId}
		>
			{series.map((s) => (
				<SeriesContextMenu
					key={s.uuid}
					href={seriesDetailPath.replace("$uuid", s.uuid)}
				>
					<div
						className={
							aspectRatio === "square"
								? DASHBOARD_AUDIOBOOK_TILE_CLASS
								: DASHBOARD_BOOK_TILE_CLASS
						}
					>
						<BookCardShell
							linkProps={{
								to: seriesDetailPath,
								params: { uuid: s.uuid },
								preload: "intent",
							}}
							ariaLabel={s.name}
							coverFilename={getCoverFilename(s.cover) ?? undefined}
							coverPreset={coverPresets.small}
							square={aspectRatio === "square"}
							coverFrameRatio={aspectRatio}
							compactTextBlock
							coverBackdrop={
								s.count > 1 ? (
									<SeriesStackBackdrop color={s.color} />
								) : undefined
							}
							title={s.name}
							subtitleLines={showAuthor ? 2 : 1}
							subtitle={
								<>
									<span className="line-clamp-1 block tabular-nums">
										{countMessage({ count: s.count })}
									</span>
									{s.author ? (
										<span className="pointer-events-auto line-clamp-1 block w-fit max-w-full">
											<AuthorLinkList
												authors={[s.author]}
												linkClassName="motion-safe:transition-colors hover:text-foreground"
											/>
										</span>
									) : null}
								</>
							}
						/>
					</div>
				</SeriesContextMenu>
			))}
		</ScrollSection>
	);
});
