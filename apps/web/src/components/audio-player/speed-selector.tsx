import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

interface SpeedSelectorProps {
	speed: number;
	onSpeedChange: (speed: number) => void;
	variant?: "default" | "player";
}

export const SpeedSelector = memo(function SpeedSelector({
	speed,
	onSpeedChange,
	variant = "default",
}: SpeedSelectorProps) {
	const isPlayer = variant === "player";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						"h-8 min-w-[3.5rem] font-mono text-xs",
						isPlayer && "text-white/70 hover:bg-white/10 hover:text-white",
					)}
					aria-label={`Playback speed: ${speed}x`}
				>
					{speed}x
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="center" sideOffset={6}>
				{SPEED_OPTIONS.map((opt) => (
					<DropdownMenuItem
						key={opt}
						onClick={() => onSpeedChange(opt)}
						className={cn(
							"justify-center font-mono text-sm",
							opt === speed && "font-bold text-primary",
						)}
					>
						{opt}x
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
});
