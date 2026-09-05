import { CaretLeft } from "@phosphor-icons/react";
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
import { useOverlayBackDismiss } from "@/hooks/use-overlay-back-dismiss";
import { useWindowEvent } from "@/hooks/use-window-event";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

interface ActivityRailProps {
	open: boolean;
	onClose: () => void;
}

/**
 * Server members + live presence. Below `lg` it stays a right-side sheet; from
 * `lg` up it slides in over the right edge of the content panel. It floats
 * rather than reserving a column on purpose: toggling it must never change the
 * workspace width, or every grid and carousel on the page re-measures and the
 * layout jumps under the reader's cursor. Non-modal — clicks behind it still
 * work, so the roster can stay open while you browse.
 */
export function ActivityRail({ open, onClose }: ActivityRailProps) {
	const isSheet = useActivityRailIsSheet();
	useOverlayBackDismiss(open && isSheet, onClose);

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
				// The rail is its own box, so sliding out takes the border along
				// instead of stranding it over the content.
				className={cn(
					"absolute inset-y-0 right-0 z-20 hidden min-h-0 w-[var(--overlay-rail-width)] max-w-full transition-transform duration-200 ease-[var(--ease-smooth-out)] lg:flex",
					open
						? "pointer-events-auto translate-x-0"
						: "pointer-events-none translate-x-full",
				)}
			>
				<div className="theme-gradient-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-sidebar-border border-t border-b-0 bg-background text-foreground">
					<div className="mt-3 flex min-h-0 min-w-0 flex-1 overflow-hidden font-medium text-sm tracking-wide">
						{open && !isSheet && <MembersList />}
					</div>
				</div>
			</aside>

			{isSheet && (
				<Sheet open={open} onOpenChange={(next) => !next && onClose()}>
					<SheetContent
						side="right"
						showCloseButton={false}
						overlayClassName="hidden"
						className="mobile-screen-sheet inset-0 bg-background p-0 shadow-none data-[side=right]:h-dvh data-[side=right]:w-dvw data-[side=right]:max-w-none data-[side=right]:border-0 data-[side=right]:sm:max-w-none"
					>
						<SheetHeader className="grid shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-sidebar-border border-b ps-[max(0.75rem,var(--safe-area-left))] pe-[max(0.75rem,var(--safe-area-right))] pt-[calc(var(--safe-area-top)+0.5rem)] pb-2 text-center">
							<Button
								type="button"
								variant="ghost"
								size="icon-lg"
								aria-label={m["aria.go_back"]()}
								title={m["aria.go_back"]()}
								onClick={onClose}
								className="size-11 rounded-full"
							>
								<CaretLeft />
							</Button>
							<div className="min-w-0">
								<SheetTitle className="truncate font-semibold text-lg">
									{m["members.title"]()}
								</SheetTitle>
								<SheetDescription className="sr-only">
									{m["members.panel"]()}
								</SheetDescription>
							</div>
							<span aria-hidden="true" />
						</SheetHeader>
						{open && (
							<MembersList
								onNavigate={onClose}
								className="ps-[max(0.25rem,var(--safe-area-left))] pe-[max(0.25rem,var(--safe-area-right))] pt-3 pb-[max(0.75rem,var(--safe-area-bottom))]"
							/>
						)}
					</SheetContent>
				</Sheet>
			)}
		</>
	);
}
