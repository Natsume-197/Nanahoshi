import { X } from "@phosphor-icons/react";
import { FriendsList } from "@/components/shared/friends-list";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

interface ActivityRailProps {
	open: boolean;
	onClose: () => void;
	reservePlayerSpace?: boolean;
}

/**
 * Friends + live presence. On mobile it stays a right-side sheet; on desktop it
 * becomes an inline right sidebar so collapsing it deliberately changes the
 * workspace width instead of floating over the page.
 */
export function ActivityRail({
	open,
	onClose,
	reservePlayerSpace = false,
}: ActivityRailProps) {
	const isMobile = useIsMobile();

	return (
		<>
			<aside
				aria-hidden={!open}
				className={cn(
					"hidden min-h-0 shrink-0 overflow-hidden bg-sidebar transition-[width,padding] duration-200 ease-linear md:flex",
					open ? "pointer-events-auto w-56 pl-2" : "pointer-events-none w-0",
				)}
			>
				<div
					className={cn(
						"flex min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground shadow-sm md:rounded-tl-2xl",
						reservePlayerSpace && "pb-[var(--player-height)]",
					)}
				>
					<div className="mt-3 flex-1 truncate font-medium text-sm tracking-wide">
						<FriendsList />
					</div>
				</div>
			</aside>

			{isMobile && (
				<Sheet open={open} onOpenChange={(next) => !next && onClose()}>
					<SheetContent
						side="right"
						showCloseButton={false}
						overlayClassName="bg-black/25 supports-backdrop-filter:backdrop-blur-none"
						className="flex w-full max-w-sm flex-col gap-0 p-0"
					>
						<SheetHeader className="flex h-14 shrink-0 flex-row items-center justify-between gap-2 px-4 py-0">
							<SheetTitle className="text-sm tracking-wide">
								{m["activity.title"]()}
							</SheetTitle>
							<SheetDescription className="sr-only">
								{m["activity.panel"]()}
							</SheetDescription>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={m["aria.friends_activity"]()}
								title={m["aria.friends_activity"]()}
								onClick={onClose}
								className="rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
							>
								<X />
							</Button>
						</SheetHeader>
						<FriendsList />
					</SheetContent>
				</Sheet>
			)}
		</>
	);
}
