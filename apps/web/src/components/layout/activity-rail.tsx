import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { FriendsList } from "@/components/shared/friends-list";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

/**
 * Tracks whether the viewport is at the `lg` breakpoint (where the rail renders
 * inline). Below it the rail becomes a slide-over Sheet, so the mobile Sheet is
 * only mounted off the desktop layout to keep its overlay from covering it.
 */
function useIsDesktop(): boolean | undefined {
	const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined);

	useMountEffect(() => {
		const mql = window.matchMedia("(min-width: 1024px)");
		const onChange = () => setIsDesktop(mql.matches);
		onChange();
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	});

	return isDesktop;
}

// Shared body for both the desktop aside and the mobile sheet, so the friends
// list and its presence query mount in exactly one of them at a time.
function ActivityRailContent() {
	return <FriendsList />;
}

interface ActivityRailProps {
	open: boolean;
	onClose: () => void;
}

export function ActivityRail({ open, onClose }: ActivityRailProps) {
	const isDesktop = useIsDesktop();

	// The desktop rail is CSS-gated (hidden below lg), so it renders during SSR and
	// the first client paint without waiting for the media query to resolve — the
	// right sidebar appears immediately while the page loads. Its content mounts
	// only when we're not certain we're on mobile, so FriendsList (and its presence
	// query) lives in exactly one place at a time.
	const showDesktopContent = isDesktop !== false;

	return (
		<>
			{/* One aside whose width animates like a drawer: collapsed to zero width
			    when closed (toggled from the header button) and sliding open to the
			    full panel. Content is pinned at the panel width so it slides in from
			    the right as the drawer opens instead of reflowing. */}
			<aside
				className={cn(
					"hidden shrink-0 overflow-hidden bg-background transition-[width] duration-300 ease-out lg:block",
					open ? "w-64 border-border/40 border-l" : "w-0",
				)}
			>
				<div className="fade-in slide-in-from-right-4 flex h-full w-64 animate-in flex-col duration-300">
					<div className="flex h-14 shrink-0 items-center justify-between px-4">
						<h2 className="font-semibold text-sm tracking-wide">
							{m["activity.title"]()}
						</h2>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={m["activity.hide"]()}
							title={m["activity.hide"]()}
							onClick={onClose}
							className="rounded-full text-muted-foreground"
						>
							<ChevronRight className="size-4" />
						</Button>
					</div>
					{showDesktopContent && open && <ActivityRailContent />}
				</div>
			</aside>

			{/* Mobile slide-over: only mounted once we know we're below lg, so its
			    overlay never covers the desktop layout and content mounts once. */}
			{isDesktop === false && (
				<Sheet open={open} onOpenChange={(next) => !next && onClose()}>
					<SheetContent
						side="right"
						className="flex w-full max-w-sm flex-col gap-0 p-0 lg:hidden"
					>
						<SheetHeader className="h-14 shrink-0 justify-center px-4">
							<SheetTitle className="text-sm tracking-wide">
								{m["activity.title"]()}
							</SheetTitle>
							<SheetDescription className="sr-only">
								{m["activity.panel"]()}
							</SheetDescription>
						</SheetHeader>
						<ActivityRailContent />
					</SheetContent>
				</Sheet>
			)}
		</>
	);
}
