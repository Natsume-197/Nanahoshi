import type { JSX, ReactNode } from "react";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";

const DASHBOARD_BOOK_TILE_CLASS =
	"w-[140px] min-w-[140px] sm:w-[160px] sm:min-w-[160px]";

type DashboardContextMenuBookProps = {
	bookUuid: string;
	children: ReactNode;
};

export function DashboardContextMenuBook({
	bookUuid,
	children,
}: DashboardContextMenuBookProps): JSX.Element {
	return (
		<BookContextMenuTrigger bookUuid={bookUuid}>
			<div className={DASHBOARD_BOOK_TILE_CLASS}>{children}</div>
		</BookContextMenuTrigger>
	);
}
