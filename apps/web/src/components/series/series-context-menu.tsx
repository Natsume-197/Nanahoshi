import { ArrowSquareOut } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface SeriesContextMenuProps {
	/** Series detail page URL (already encoded) — the caller owns the route. */
	href: string;
	children: ReactNode;
}

/**
 * Right-click menu for a series tile. The single child becomes the trigger
 * (via `asChild`), so it stays the layout node and left-click navigation keeps
 * working. Kept intentionally small — extend with batch actions (add to
 * collection, set shelf) by reusing the per-book mutations over
 * `books.listBySeries`.
 */
export function SeriesContextMenu({ href, children }: SeriesContextMenuProps) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-48">
				<ContextMenuItem
					onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
				>
					<ArrowSquareOut />
					Open in New Tab
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
