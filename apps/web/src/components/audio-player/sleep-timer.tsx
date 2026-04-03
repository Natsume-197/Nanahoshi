import { Moon } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { cn } from "@/lib/utils";

const TIMER_OPTIONS = [
	{ label: "5 min", minutes: 5 },
	{ label: "15 min", minutes: 15 },
	{ label: "30 min", minutes: 30 },
	{ label: "45 min", minutes: 45 },
	{ label: "60 min", minutes: 60 },
] as const;

interface SleepTimerProps {
	onSleep: () => void;
	variant?: "default" | "player";
}

export const SleepTimer = memo(function SleepTimer({
	onSleep,
	variant = "default",
}: SleepTimerProps) {
	const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const onSleepRef = useRef(onSleep);
	onSleepRef.current = onSleep;

	const clearTimer = useCallback(() => {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		setRemainingSeconds(null);
	}, []);

	const startTimer = useCallback(
		(minutes: number) => {
			clearTimer();
			setRemainingSeconds(minutes * 60);
			timerRef.current = setInterval(() => {
				setRemainingSeconds((prev) => {
					if (prev === null || prev <= 1) {
						if (timerRef.current) {
							clearInterval(timerRef.current);
							timerRef.current = null;
						}
						onSleepRef.current();
						return null;
					}
					return prev - 1;
				});
			}, 1000);
		},
		[clearTimer],
	);

	useMountEffect(() => {
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	});

	const isActive = remainingSeconds !== null;
	const isPlayer = variant === "player";
	const displayRemaining = isActive
		? `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`
		: null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						"h-8 gap-1.5 text-xs",
						isPlayer
							? cn(
									"hover:bg-white/10",
									isActive
										? "text-white hover:text-white"
										: "text-white/70 hover:text-white",
								)
							: isActive && "text-primary",
					)}
					aria-label={
						isActive
							? `Sleep timer: ${displayRemaining} remaining`
							: "Set sleep timer"
					}
				>
					<Moon className="size-3.5" />
					{displayRemaining ?? "Sleep"}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="center" sideOffset={6}>
				{TIMER_OPTIONS.map((opt) => (
					<DropdownMenuItem
						key={opt.minutes}
						onClick={() => startTimer(opt.minutes)}
					>
						{opt.label}
					</DropdownMenuItem>
				))}
				{isActive && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={clearTimer}
							className="text-muted-foreground"
						>
							Cancel timer
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
});
