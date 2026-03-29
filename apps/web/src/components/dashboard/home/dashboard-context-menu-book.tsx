import type { JSX, ReactNode } from "react";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";
import type { MediaType } from "@/hooks/books/use-book-context-menu-actions";

const DASHBOARD_BOOK_TILE_CLASS =
	"w-[140px] min-w-[140px] sm:w-[160px] sm:min-w-[160px]";

type DashboardContextMenuBookProps = {
	bookUuid: string;
	children: ReactNode;
	mediaType?: MediaType;
};

export function DashboardContextMenuBook({
	bookUuid,
	children,
	mediaType,
}: DashboardContextMenuBookProps): JSX.Element {
	return (
		<BookContextMenuTrigger bookUuid={bookUuid} mediaType={mediaType}>
			<div className={DASHBOARD_BOOK_TILE_CLASS}>{children}</div>
		</BookContextMenuTrigger>
	);
}
