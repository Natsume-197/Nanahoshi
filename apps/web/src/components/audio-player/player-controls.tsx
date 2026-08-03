import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom";

/** Icon button with a tooltip; the label doubles as the accessible name. */
export function PlayerIconButton({
	label,
	side = "top",
	className,
	disabled,
	pressed,
	onClick,
	children,
}: {
	label: string;
	side?: Side;
	className?: string;
	disabled?: boolean;
	pressed?: boolean;
	onClick: () => void;
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
