import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { cn } from "@/lib/utils";
import { TONE_BG, type Tone } from "./goal-gauge";

/** Twenty-four bars of the local clock; ticks every six hours like Apple's Screen Time. */
export function HourChart({
	values,
	tone,
	label,
}: {
	values: number[];
	tone: Tone;
	label: string;
}) {
	const max = Math.max(...values, 0);
	const peak = values.indexOf(max);
	return (
		<figure aria-label={label} className="space-y-2">
			<div className="flex h-28 items-end gap-[3px]">
				{values.map((value, hour) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: the index is the hour.
						key={hour}
						title={`${String(hour).padStart(2, "0")}:00 · ${readingDuration(value)}`}
						className={cn(
							"min-w-0 flex-1 rounded-t-[3px]",
							value > 0 ? TONE_BG[tone] : "bg-[var(--stats-empty)]",
							value > 0 && hour !== peak && "opacity-55",
						)}
						style={{
							height:
								value > 0 && max > 0 ? `max(3px, ${(value / max) * 100}%)` : 3,
						}}
					/>
				))}
			</div>
			<div
				aria-hidden="true"
				className="grid grid-cols-4 text-muted-foreground text-xs tabular-nums"
			>
				{["00", "06", "12", "18"].map((hour) => (
					<span key={hour}>{hour}</span>
				))}
			</div>
		</figure>
	);
}
