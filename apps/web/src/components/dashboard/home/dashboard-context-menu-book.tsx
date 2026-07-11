import type { JSX, ReactNode } from "react";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";
import type { MediaType } from "@/hooks/books/use-book-context-menu-actions";
import {
	DASHBOARD_AUDIOBOOK_TILE_CLASS,
	DASHBOARD_BOOK_TILE_CLASS,
} from "./section-skeleton";

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
			<div
				className={
					mediaType === "audiobook"
						? DASHBOARD_AUDIOBOOK_TILE_CLASS
						: DASHBOARD_BOOK_TILE_CLASS
				}
			>
				{children}
			</div>
		</BookContextMenuTrigger>
	);
}
