import { ArrowSquareOut, DotsThreeVertical, X } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { memo, useState } from "react";
import { JumpSettings } from "@/components/audio-player/player-jump-settings";
import { ReadListenIcon } from "@/components/read-listen/read-listen-icon";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudioPlayerActions } from "@/context/audio-player-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { m } from "@/paraglide/messages";

const ROW_CLASS = "h-9 w-full justify-start gap-2 px-2 font-normal";

/** Navigation and jump actions shared by the popover and the mobile drawer. */
function MoreActions({
	uuid,
	onOpenReadListenReader,
	onReadListenIntent,
	onReadListenCommitIntent,
	onDone,
}: {
	uuid: string;
	onOpenReadListenReader?: () => void;
	onReadListenIntent?: () => void;
	onReadListenCommitIntent?: () => void;
	onDone: () => void;
}) {
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
			{onOpenReadListenReader && (
				<Button
					variant="ghost"
					size="sm"
					className={ROW_CLASS}
					onPointerEnter={onReadListenIntent}
					onFocus={onReadListenCommitIntent}
					onPointerDown={onReadListenCommitIntent}
					onClick={() => {
						onDone();
						onOpenReadListenReader();
					}}
				>
					<ReadListenIcon aria-hidden="true" className="size-4" />
					{m["read_listen.open_full_reader"]()}
				</Button>
			)}
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
	onOpenReadListenReader,
	onReadListenIntent,
	onReadListenCommitIntent,
}: {
	uuid: string;
	onOpenReadListenReader?: () => void;
	onReadListenIntent?: () => void;
	onReadListenCommitIntent?: () => void;
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
			className="size-10 text-foreground"
		>
			<DotsThreeVertical className="size-5" weight="bold" />
		</Button>
	);

	if (isMobile) {
		return (
			<>
				{trigger}
				<Drawer
					open={open}
					onOpenChange={setOpen}
					overlayClassName="supports-backdrop-filter:backdrop-blur-none"
					showSwipeHandle
				>
					<DrawerContent className="rounded-t-[1.75rem] rounded-b-none border-x-0 border-b-0 [--drawer-content-max-height:min(80dvh,40rem)] [--drawer-inset:0px]">
						<DrawerHeader className="px-[max(1rem,var(--safe-area-left))] pt-2 pr-[max(1rem,var(--safe-area-right))] pb-2 text-start">
							<DrawerTitle>{label}</DrawerTitle>
						</DrawerHeader>
						<div className="min-h-0 overflow-y-auto overscroll-contain px-[max(1rem,var(--safe-area-left))] pt-1 pr-[max(1rem,var(--safe-area-right))] pb-[max(1rem,var(--safe-area-bottom))]">
							<MoreActions
								uuid={uuid}
								onOpenReadListenReader={onOpenReadListenReader}
								onReadListenIntent={onReadListenIntent}
								onReadListenCommitIntent={onReadListenCommitIntent}
								onDone={() => setOpen(false)}
							/>
						</div>
					</DrawerContent>
				</Drawer>
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
				<MoreActions
					uuid={uuid}
					onOpenReadListenReader={onOpenReadListenReader}
					onReadListenIntent={onReadListenIntent}
					onReadListenCommitIntent={onReadListenCommitIntent}
					onDone={() => setOpen(false)}
				/>
			</PopoverContent>
		</Popover>
	);
});
