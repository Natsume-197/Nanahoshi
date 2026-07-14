import type { JSX } from "react";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RESUME_CARD_WIDTH_CLASS } from "./resume-card";

export const DASHBOARD_LIMIT = 15;

/** Width of a single media tile inside the dashboard carousels. */
export const DASHBOARD_BOOK_TILE_CLASS =
	"w-[155px] min-w-[155px] sm:w-[180px] sm:min-w-[180px] lg:w-[195px] lg:min-w-[195px]";

/** Audiobook tiles never render a cover smaller than Continue's square cover. */
export const DASHBOARD_AUDIOBOOK_TILE_CLASS = "w-[13rem] min-w-[13rem]";

const SKELETON_IDS = Array.from({ length: 12 }, (_, i) => `skeleton-${i}`);
const RESUME_SKELETON_IDS = Array.from(
	{ length: 6 },
	(_, i) => `resume-skeleton-${i}`,
);

/** Loading placeholder matching the ResumeCard rows (continue reading/listening). */
export function ResumeSectionSkeleton({
	square: _square = false,
}: {
	square?: boolean;
}): JSX.Element {
	return (
		<ScrollSection title={<Skeleton className="h-7 w-44 rounded" />}>
			{RESUME_SKELETON_IDS.map((id) => (
				<Skeleton
					key={id}
					className={cn(
						RESUME_CARD_WIDTH_CLASS,
						"h-[10.75rem] shrink-0 rounded-xl sm:h-[14rem]",
					)}
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
		<ScrollSection title={<Skeleton className="h-7 w-44 rounded" />}>
			{SKELETON_IDS.map((id) => (
				<BookCardSkeleton
					key={id}
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
