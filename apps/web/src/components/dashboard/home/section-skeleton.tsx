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

const SKELETON_IDS = Array.from({ length: 12 }, (_, i) => `skeleton-${i}`);
const RESUME_SKELETON_IDS = Array.from(
	{ length: 6 },
	(_, i) => `resume-skeleton-${i}`,
);

/** Loading placeholder matching the ResumeCard rows (continue reading/listening). */
export function ResumeSectionSkeleton({
	square = false,
}: {
	square?: boolean;
}): JSX.Element {
	return (
		<ScrollSection title={<Skeleton className="h-7 w-44 rounded" />}>
			{RESUME_SKELETON_IDS.map((id) => (
				<div
					key={id}
					className={cn(RESUME_CARD_WIDTH_CLASS, "flex shrink-0 gap-3 p-2")}
				>
					<Skeleton
						className={cn(
							"shrink-0 rounded-md",
							square ? "size-[12rem]" : "h-[12rem] w-[8rem]",
						)}
					/>
					<div className="flex min-w-0 flex-1 flex-col py-0.5">
						<Skeleton className="h-5 w-3/4 rounded" />
						<Skeleton className="mt-2 h-4 w-1/2 rounded" />
						<Skeleton className="mt-auto h-4 w-24 rounded" />
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
					className={cn(DASHBOARD_BOOK_TILE_CLASS, "shrink-0")}
					square={square}
				/>
			))}
		</ScrollSection>
	);
}
