import { ArrowSquareOut, DotsThree, X } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { memo, useState } from "react";
import { JumpSettings } from "@/components/audio-player/player-jump-settings";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudioPlayerActions } from "@/context/audio-player-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { m } from "@/paraglide/messages";

const ROW_CLASS = "h-9 w-full justify-start gap-2 px-2 font-normal";

/** The two navigations plus the jump amounts, shared by the popover and the sheet. */
function MoreActions({ uuid, onDone }: { uuid: string; onDone: () => void }) {
	const { stop, setExpanded } = useAudioPlayerActions();

	return (
		<div className="flex flex-col gap-3">
			<Button
				asChild
				variant="ghost"
				size="sm"
				className={ROW_CLASS}
				onClick={() => {
					setExpanded(false);
					onDone();
				}}
			>
				<Link to="/dashboard/audiobooks/$uuid" params={{ uuid }}>
					<ArrowSquareOut className="size-4" />
					{m["audiobook.player_view_details"]()}
				</Link>
			</Button>
			<Separator />
			<JumpSettings />
			<Separator />
			<Button
				variant="ghost"
				size="sm"
				className={ROW_CLASS}
				onClick={() => {
					stop();
					onDone();
				}}
			>
				<X className="size-4" />
				{m["audiobook.player_stop"]()}
			</Button>
		</div>
	);
}

/**
 * The expanded player's overflow menu. Everything that isn't playback lives
 * here — leaving the artwork, the jump amounts (the one setting the expanded
 * controls don't already expose), and closing the player. A bottom sheet on
 * phones, where a popover anchored to a corner button is a poor target.
 */
export const PlayerMoreMenu = memo(function PlayerMoreMenu({
	uuid,
}: {
	uuid: string;
}) {
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);
	const label = m["audiobook.player_more"]();

	const trigger = (
		<Button
			variant="ghost"
			size="icon"
			aria-label={label}
			onClick={isMobile ? () => setOpen(true) : undefined}
			className="size-9 text-muted-foreground"
		>
			<DotsThree className="size-5" weight="bold" />
		</Button>
	);

	if (isMobile) {
		return (
			<>
				{trigger}
				<Sheet open={open} onOpenChange={setOpen}>
					<SheetContent
						side="bottom"
						showCloseButton={false}
						className="gap-3 rounded-t-2xl p-4 pb-[calc(1rem+var(--safe-area-bottom))]"
					>
						<SheetTitle className="sr-only">{label}</SheetTitle>
						<MoreActions uuid={uuid} onDone={() => setOpen(false)} />
					</SheetContent>
				</Sheet>
			</>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>{trigger}</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={8}>
					{label}
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				side="bottom"
				align="end"
				sideOffset={8}
				className="w-64 rounded-xl p-3"
			>
				<MoreActions uuid={uuid} onDone={() => setOpen(false)} />
			</PopoverContent>
		</Popover>
	);
});
