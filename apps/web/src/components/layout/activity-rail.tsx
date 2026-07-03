import { FriendsList } from "@/components/shared/friends-list";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { m } from "@/paraglide/messages";

interface ActivityRailProps {
	open: boolean;
	onClose: () => void;
}

/**
 * The Activity panel (friends + live presence) as a right-side slide-over on
 * every breakpoint. It overlays the page instead of reserving a column, so it
 * never reflows the layout or intrudes on the hero color wash.
 */
export function ActivityRail({ open, onClose }: ActivityRailProps) {
	return (
		<Sheet open={open} onOpenChange={(next) => !next && onClose()}>
			<SheetContent
				side="right"
				overlayClassName="bg-black/25 supports-backdrop-filter:backdrop-blur-none"
				className="flex w-full max-w-sm flex-col gap-0 p-0"
			>
				<SheetHeader className="h-14 shrink-0 justify-center px-4">
					<SheetTitle className="text-sm tracking-wide">
						{m["activity.title"]()}
					</SheetTitle>
					<SheetDescription className="sr-only">
						{m["activity.panel"]()}
					</SheetDescription>
				</SheetHeader>
				<FriendsList />
			</SheetContent>
		</Sheet>
	);
}
