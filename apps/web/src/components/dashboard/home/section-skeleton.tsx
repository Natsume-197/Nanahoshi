import type { JSX } from "react";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const DASHBOARD_LIMIT = 12;

/** Width of a single media tile inside the dashboard carousels. */
export const DASHBOARD_BOOK_TILE_CLASS =
	"w-[150px] min-w-[150px] sm:w-[165px] sm:min-w-[165px] lg:w-[180px] lg:min-w-[180px]";

/** Square audiobook tiles follow the same responsive dashboard scale. */
export const DASHBOARD_AUDIOBOOK_TILE_CLASS =
	"w-[150px] min-w-[150px] sm:w-[165px] sm:min-w-[165px] lg:w-[180px] lg:min-w-[180px]";

const SKELETON_IDS = Array.from({ length: 12 }, (_, i) => `skeleton-${i}`);
const RESUME_SKELETON_IDS = Array.from(
	{ length: 4 },
	(_, i) => `resume-skeleton-${i}`,
);

/** Loading placeholder for the compact, tinted resume cards. */
export function ResumeSectionSkeleton(): JSX.Element {
	return (
		<ScrollSection
			title={<Skeleton as="span" className="inline-block h-7 w-44 rounded" />}
			layout="resume"
		>
			{RESUME_SKELETON_IDS.map((id) => (
				<Skeleton
					key={id}
					className="h-[5.25rem] min-w-0 rounded-2xl shadow-card sm:h-[5.5rem]"
				/>
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
		<ScrollSection
			title={<Skeleton as="span" className="inline-block h-7 w-44 rounded" />}
		>
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
