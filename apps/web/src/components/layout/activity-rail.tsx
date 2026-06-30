import { ChevronLeft, ChevronRight } from "lucide-react";
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
	onOpen: () => void;
	onClose: () => void;
}

export function ActivityRail({ open, onOpen, onClose }: ActivityRailProps) {
	const isDesktop = useIsDesktop();

	// Until the breakpoint is known, render nothing — avoids briefly flashing the
	// mobile slide-over on desktop while the media query resolves after mount.
	if (isDesktop === undefined) return null;

	if (isDesktop) {
		// Collapsed: a thin strip pinned to the right; clicking anywhere expands it.
		if (!open) {
			return (
				<aside className="hidden w-12 shrink-0 lg:block">
					<button
						type="button"
						aria-label="Show activity"
						title="Show activity"
						onClick={onOpen}
						className="flex size-full items-center justify-center border-border/40 border-l bg-background text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
					>
						<ChevronLeft className="size-5" />
					</button>
				</aside>
			);
		}
		return (
			<aside className="hidden w-64 shrink-0 flex-col border-border/40 border-l bg-background lg:flex">
				<div className="flex h-14 shrink-0 items-center justify-between px-4">
					<h2 className="font-semibold text-sm tracking-wide">Activity</h2>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Hide activity"
						title="Hide activity"
						onClick={onClose}
						className="rounded-full text-muted-foreground"
					>
						<ChevronRight className="size-4" />
					</Button>
				</div>
				<ActivityRailContent />
			</aside>
		);
	}

	return (
		<Sheet open={open} onOpenChange={(next) => !next && onClose()}>
			<SheetContent
				side="right"
				className="flex w-full max-w-sm flex-col gap-0 p-0 lg:hidden"
			>
				<SheetHeader className="h-14 shrink-0 justify-center px-4">
					<SheetTitle className="text-sm tracking-wide">Activity</SheetTitle>
					<SheetDescription className="sr-only">
						Activity panel
					</SheetDescription>
				</SheetHeader>
				<ActivityRailContent />
			</SheetContent>
		</Sheet>
	);
}
