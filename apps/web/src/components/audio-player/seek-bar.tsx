import { Slider as SliderPrimitive } from "radix-ui";
import { memo, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/utils/format";

interface SeekBarProps {
	currentTime: number;
	duration: number;
	onSeek: (time: number) => void;
	variant?: "default" | "player";
}

export const SeekBar = memo(function SeekBar({
	currentTime,
	duration,
	onSeek,
	variant = "default",
}: SeekBarProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [dragValue, setDragValue] = useState(0);
	const commitRef = useRef(onSeek);
	commitRef.current = onSeek;

	const displayTime = isDragging ? dragValue : currentTime;
	const remaining = Math.max(0, duration - displayTime);
	const isPlayer = variant === "player";

	if (isPlayer) {
		return (
			<div className="space-y-1">
				<SliderPrimitive.Root
					min={0}
					max={Math.max(duration, 1)}
					step={1}
					value={[displayTime]}
					onValueChange={([val]) => {
						setIsDragging(true);
						setDragValue(val ?? 0);
					}}
					onValueCommit={([val]) => {
						setIsDragging(false);
						commitRef.current(val ?? 0);
					}}
					className="relative flex w-full touch-none select-none items-center"
				>
					<SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/30">
						<SliderPrimitive.Range className="absolute h-full bg-white" />
					</SliderPrimitive.Track>
					<SliderPrimitive.Thumb className="block size-3 rounded-full bg-white shadow-sm ring-white/30 transition-colors hover:ring-4 focus-visible:outline-hidden focus-visible:ring-4" />
				</SliderPrimitive.Root>
				<div className="flex justify-between px-0.5 text-white/50 text-xs tabular-nums">
					<span>{formatTime(displayTime)}</span>
					<span>-{formatTime(remaining)}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-1">
			<Slider
				min={0}
				max={Math.max(duration, 1)}
				step={1}
				value={[displayTime]}
				onValueChange={([val]) => {
					setIsDragging(true);
					setDragValue(val ?? 0);
				}}
				onValueCommit={([val]) => {
					setIsDragging(false);
					commitRef.current(val ?? 0);
				}}
			/>
			<div className="flex justify-between px-0.5 text-muted-foreground text-xs tabular-nums">
				<span>{formatTime(displayTime)}</span>
				<span>-{formatTime(remaining)}</span>
			</div>
		</div>
	);
});
