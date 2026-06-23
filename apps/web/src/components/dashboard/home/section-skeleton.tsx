import type { JSX } from "react";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const DASHBOARD_LIMIT = 15;

/** Width of a single media tile inside the dashboard carousels. */
export const DASHBOARD_BOOK_TILE_CLASS =
	"w-[170px] min-w-[170px] sm:w-[200px] sm:min-w-[200px] lg:w-[220px] lg:min-w-[220px]";

const SKELETON_IDS = Array.from({ length: 12 }, (_, i) => `skeleton-${i}`);

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
