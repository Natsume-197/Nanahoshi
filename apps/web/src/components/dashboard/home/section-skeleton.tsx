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

/** Loading placeholder for the wide resume rail (cover beside its text). */
export function ResumeSectionSkeleton(): JSX.Element {
	return (
		<ScrollSection
			title={<Skeleton as="span" className="inline-block h-7 w-44 rounded" />}
			layout="resume"
		>
			{RESUME_SKELETON_IDS.map((id) => (
				<div key={id} className="flex min-w-0 items-center gap-4">
					<Skeleton className="aspect-[2/3] w-[150px] shrink-0 rounded-md sm:w-[165px] lg:w-[180px]" />
					<div className="min-w-0 flex-1 space-y-2">
						<Skeleton className="h-5 w-4/5 rounded" />
						<Skeleton className="h-4 w-1/2 rounded" />
						<Skeleton className="h-4 w-1/3 rounded" />
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
