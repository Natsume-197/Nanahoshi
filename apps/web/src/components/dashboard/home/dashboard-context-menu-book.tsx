import type { JSX, ReactNode } from "react";
import { useBookCardPresentation } from "@/components/books/book-card-presentation-context";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";
import type { MediaType } from "@/hooks/books/use-book-context-menu-actions";
import {
	DASHBOARD_AUDIOBOOK_TILE_CLASS,
	DASHBOARD_BOOK_TILE_CLASS,
	DASHBOARD_SHOWCASE_TILE_CLASS,
} from "./section-skeleton";

type DashboardContextMenuBookProps = {
	bookUuid: string;
	children: ReactNode;
	mediaType?: MediaType;
	isRecommendation?: boolean;
};

export function DashboardContextMenuBook({
	bookUuid,
	children,
	mediaType,
	isRecommendation,
}: DashboardContextMenuBookProps): JSX.Element {
	const presentation = useBookCardPresentation();
	return (
		<BookContextMenuTrigger
			bookUuid={bookUuid}
			mediaType={mediaType}
			isRecommendation={isRecommendation}
		>
			<div
				className={
					presentation === "showcase"
						? DASHBOARD_SHOWCASE_TILE_CLASS
						: mediaType === "audiobook"
							? DASHBOARD_AUDIOBOOK_TILE_CLASS
							: DASHBOARD_BOOK_TILE_CLASS
				}
			>
				{children}
			</div>
		</BookContextMenuTrigger>
	);
}
