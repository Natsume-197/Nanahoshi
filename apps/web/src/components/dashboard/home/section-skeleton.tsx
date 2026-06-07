import type { JSX } from "react";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Skeleton } from "@/components/ui/skeleton";

export const DASHBOARD_LIMIT = 15;

/** Width of a single media tile inside the dashboard carousels. */
export const DASHBOARD_BOOK_TILE_CLASS =
	"w-[154px] min-w-[154px] sm:w-[176px] sm:min-w-[176px]";

const SKELETON_IDS = Array.from({ length: 15 }, (_, i) => `skeleton-${i}`);
const SKELETON_CARDS = SKELETON_IDS.map((id) => (
	<BookCardSkeleton key={id} className="w-[160px] shrink-0" />
));

export function SectionSkeleton(): JSX.Element {
	return (
		<ScrollSection title={<Skeleton className="h-5 w-36 rounded" />}>
			{SKELETON_CARDS}
		</ScrollSection>
	);
}
