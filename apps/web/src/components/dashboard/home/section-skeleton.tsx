import type { JSX } from "react";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const DASHBOARD_LIMIT = 15;

/** Width of a single media tile inside the dashboard carousels. */
export const DASHBOARD_BOOK_TILE_CLASS =
	"w-[150px] min-w-[150px] sm:w-[165px] sm:min-w-[165px] lg:w-[180px] lg:min-w-[180px]";

/** Square audiobook tiles follow the same responsive dashboard scale. */
export const DASHBOARD_AUDIOBOOK_TILE_CLASS =
	"w-[150px] min-w-[150px] sm:w-[165px] sm:min-w-[165px] lg:w-[180px] lg:min-w-[180px]";

const SKELETON_IDS = Array.from({ length: 12 }, (_, i) => `skeleton-${i}`);
const RESUME_SKELETON_IDS = Array.from(
	{ length: 3 },
	(_, i) => `resume-skeleton-${i}`,
);

/** Loading placeholder matching the ResumeCard rows (continue reading/listening). */
export function ResumeSectionSkeleton({
	square = false,
}: {
	square?: boolean;
}): JSX.Element {
	return (
		<ScrollSection
			title={<Skeleton className="h-7 w-44 rounded" />}
			layout="grid"
		>
			{RESUME_SKELETON_IDS.map((id) => (
				<div
					key={id}
					className="flex h-[10rem] w-full min-w-0 gap-3 overflow-hidden rounded-xl bg-[color-mix(in_oklab,var(--background)_60%,var(--card))] sm:h-[12rem] sm:gap-4"
				>
					<Skeleton
						className={cn(
							"h-full shrink-0 rounded-lg",
							square ? "aspect-square" : "aspect-[2/3]",
						)}
					/>
					<div className="flex min-w-0 flex-1 flex-col gap-2 py-3 sm:py-4">
						<Skeleton className="h-5 w-4/5 rounded" />
						<Skeleton className="h-4 w-1/2 rounded" />
						<div className="mt-auto flex flex-col gap-2">
							<Skeleton className="h-3.5 w-2/3 rounded" />
							<Skeleton className="h-1 w-full rounded-full" />
							<Skeleton className="h-3.5 w-1/3 rounded" />
						</div>
					</div>
				</div>
			))}
		</ScrollSection>
	);
}

export function SectionSkeleton({
	square = false,
}: {
	square?: boolean;
}): JSX.Element {
	return (
		<ScrollSection title={<Skeleton className="h-7 w-44 rounded" />}>
			{SKELETON_IDS.map((id) => (
				<BookCardSkeleton
					key={id}
					compactTextBlock
					className={cn(
						square ? DASHBOARD_AUDIOBOOK_TILE_CLASS : DASHBOARD_BOOK_TILE_CLASS,
						"shrink-0",
					)}
					square={square}
				/>
			))}
		</ScrollSection>
	);
}
