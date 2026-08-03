import { X } from "@phosphor-icons/react";
import { MembersList } from "@/components/shared/members-list";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useActivityRailIsSheet } from "@/hooks/use-mobile";
import { useWindowEvent } from "@/hooks/use-window-event";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

interface ActivityRailProps {
	open: boolean;
	onClose: () => void;
	reservePlayerSpace?: boolean;
}

/**
 * Server members + live presence. Below `lg` it stays a right-side sheet; from
 * `lg` up it slides in over the right edge of the content panel. It floats
 * rather than reserving a column on purpose: toggling it must never change the
 * workspace width, or every grid and carousel on the page re-measures and the
 * layout jumps under the reader's cursor. Non-modal — clicks behind it still
 * work, so the roster can stay open while you browse.
 */
export function ActivityRail({
	open,
	onClose,
	reservePlayerSpace = false,
}: ActivityRailProps) {
	const isSheet = useActivityRailIsSheet();

	// Escape dismisses the desktop overlay, but only when it's the topmost layer:
	// the sheet and any open dialog handle their own Escape.
	useWindowEvent("keydown", (event) => {
		if (event.key !== "Escape" || !open || isSheet) return;
		if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
		onClose();
	});

	return (
		<>
			<aside
				aria-hidden={!open}
				inert={!open}
				className={cn(
					"theme-gradient-surface absolute inset-y-0 right-0 z-20 hidden min-h-0 w-72 flex-col overflow-hidden border-border border-l bg-background text-foreground shadow-[-12px_0_28px_-16px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-[var(--ease-smooth-out)] lg:flex",
					reservePlayerSpace && "pb-[var(--player-reserve)]",
					open
						? "pointer-events-auto translate-x-0"
						: "pointer-events-none translate-x-full",
				)}
			>
				<div className="mt-3 flex min-h-0 min-w-0 flex-1 overflow-hidden font-medium text-sm tracking-wide">
					<MembersList />
				</div>
			</aside>

			{isSheet && (
				<Sheet open={open} onOpenChange={(next) => !next && onClose()}>
					<SheetContent
						side="right"
						showCloseButton={false}
						overlayClassName="bg-black/25 supports-backdrop-filter:backdrop-blur-none"
						className="flex w-full max-w-sm flex-col gap-0 p-0"
					>
						<SheetHeader className="flex h-14 shrink-0 flex-row items-center justify-between gap-2 px-4 py-0">
							<SheetTitle className="text-sm tracking-wide">
								{m["members.title"]()}
							</SheetTitle>
							<SheetDescription className="sr-only">
								{m["members.panel"]()}
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
						<MembersList />
					</SheetContent>
				</Sheet>
			)}
		</>
	);
}
