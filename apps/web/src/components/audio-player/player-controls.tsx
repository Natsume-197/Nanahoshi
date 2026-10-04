import { Button } from "@nanahoshi/ui/components/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@nanahoshi/ui/components/drawer";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@nanahoshi/ui/components/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@nanahoshi/ui/components/tooltip";
import { useIsMobile } from "@nanahoshi/ui/hooks/use-mobile";
import { cn } from "@nanahoshi/ui/lib/utils";
import { type ReactNode, useState } from "react";

type Side = "top" | "bottom";

/** Icon button with a tooltip; the label doubles as the accessible name. */
export function PlayerIconButton({
	label,
	side = "top",
	className,
	disabled,
	pressed,
	onClick,
	onFocus,
	onPointerDown,
	onPointerEnter,
	children,
}: {
	label: string;
	side?: Side;
	className?: string;
	disabled?: boolean;
	pressed?: boolean;
	onClick: () => void;
	onFocus?: () => void;
	onPointerDown?: () => void;
	onPointerEnter?: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={label}
					aria-pressed={pressed}
					disabled={disabled}
					onClick={onClick}
					onFocus={onFocus}
					onPointerDown={onPointerDown}
					onPointerEnter={onPointerEnter}
					className={cn("size-8 text-muted-foreground", className)}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent side={side} sideOffset={8}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

/** Same button, opening a settings popover instead of firing an action. */
export function PlayerPopoverButton({
	label,
	side = "top",
	align = "center",
	className,
	contentClassName,
	trigger,
	children,
}: {
	label: string;
	side?: Side;
	align?: "start" | "center" | "end";
	className?: string;
	contentClassName?: string;
	trigger: ReactNode;
	children: ReactNode;
}) {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label={label}
							className={cn("size-8 text-muted-foreground", className)}
						>
							{trigger}
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side={side} sideOffset={8}>
					{label}
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				side={side}
				align={align}
				sideOffset={8}
				className={cn("w-60 rounded-xl p-3", contentClassName)}
			>
				{children}
			</PopoverContent>
		</Popover>
	);
}

/**
 * A settings button that opens a bottom sheet on phones and a popover
 * elsewhere. A popover anchored to a corner button is a poor target for a
 * thumb, and its compact rows are smaller than a finger; the sheet gets
 * full-width, touch-sized controls (`children` is told which it is).
 */
export function PlayerSheetButton({
	label,
	title,
	side = "top",
	align = "center",
	className,
	contentClassName,
	trigger,
	children,
}: {
	label: string;
	/** The sheet's heading on phones. */
	title: string;
	side?: Side;
	align?: "start" | "center" | "end";
	className?: string;
	contentClassName?: string;
	trigger: ReactNode;
	children: (touch: boolean) => ReactNode;
}) {
	const isMobile = useIsMobile();
	const [open, setOpen] = useState(false);

	if (!isMobile) {
		return (
			<PlayerPopoverButton
				label={label}
				side={side}
				align={align}
				className={className}
				contentClassName={contentClassName}
				trigger={trigger}
			>
				{children(false)}
			</PlayerPopoverButton>
		);
	}

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				aria-label={label}
				aria-haspopup="dialog"
				onClick={() => setOpen(true)}
				className={cn("size-8 text-muted-foreground", className)}
			>
				{trigger}
			</Button>
			<Drawer
				open={open}
				onOpenChange={setOpen}
				overlayClassName="supports-backdrop-filter:backdrop-blur-none"
				showSwipeHandle
			>
				<DrawerContent className="rounded-t-[1.75rem] rounded-b-none border-x-0 border-b-0 [--drawer-content-max-height:min(85dvh,44rem)] [--drawer-inset:0px]">
					<DrawerHeader className="px-[max(1.25rem,var(--safe-area-left))] pt-2 pr-[max(1.25rem,var(--safe-area-right))] pb-1 text-start">
						<DrawerTitle>{title}</DrawerTitle>
					</DrawerHeader>
					<div className="flex min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain px-[max(1.25rem,var(--safe-area-left))] pt-2 pr-[max(1.25rem,var(--safe-area-right))] pb-[max(1.25rem,var(--safe-area-bottom))]">
						{children(true)}
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
}
