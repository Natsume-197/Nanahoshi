import { Download, Heart } from "lucide-react";
import type { ReactNode } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useBookContextMenuActions } from "@/hooks/use-book-context-menu-actions";

interface BookContextMenuProps {
	bookUuid: string;
	children: ReactNode;
}

export function BookContextMenu({
	bookUuid,
	children,
}: BookContextMenuProps) {
	const {
		handleDownload,
		handleMenuOpenChange,
		handleToggleLike,
		isLiked,
		isLikeActionBusy,
		likeActionLabel,
	} = useBookContextMenuActions(bookUuid);

	return (
		<ContextMenu onOpenChange={handleMenuOpenChange}>
			<ContextMenuTrigger className="block">{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				<ContextMenuItem
					onClick={() => {
						void handleDownload();
					}}
				>
					<Download className="size-4" />
					Download
				</ContextMenuItem>
				<ContextMenuItem disabled={isLikeActionBusy} onClick={handleToggleLike}>
					<Heart className={`size-4 ${isLiked ? "fill-current" : ""}`} />
					{likeActionLabel}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
