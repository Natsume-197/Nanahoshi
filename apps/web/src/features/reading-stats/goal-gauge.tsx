import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "reading" | "listening";

export const TONE_CLASS: Record<Tone, string> = {
	reading: "text-[var(--stats-reading)]",
	listening: "text-[var(--stats-listening)]",
};
export const TONE_BG: Record<Tone, string> = {
	reading: "bg-[var(--stats-reading)]",
	listening: "bg-[var(--stats-listening)]",
};

const WIDTH = 240;
const STROKE = 12;
const GAP = 5;

/** Half-ring gauge in Hoshi Reader's shape; a second medium nests inside like Apple's rings. */
export function GoalGauge({
	arcs,
	label,
	done,
	children,
}: {
	arcs: { tone: Tone; ratio: number | null }[];
	label: string;
	done?: boolean;
	children: ReactNode;
}) {
	const outer = (WIDTH - STROKE) / 2;
	const height = WIDTH / 2 + STROKE / 2;
	return (
		<div className="relative mx-auto w-full max-w-[22rem]">
			<svg
				role="img"
				aria-label={label}
				viewBox={`0 0 ${WIDTH} ${height}`}
				className="block w-full overflow-visible"
			>
				{arcs.map((arc, i) => {
					const radius = outer - i * (STROKE + GAP);
					const path = `M ${WIDTH / 2 - radius} ${WIDTH / 2} A ${radius} ${radius} 0 0 1 ${WIDTH / 2 + radius} ${WIDTH / 2}`;
					const filled = Math.max(0, Math.min(1, arc.ratio ?? 0));
					return (
						<g
							key={arc.tone}
							className={cn(
								TONE_CLASS[arc.tone],
								done && (arc.ratio ?? 0) >= 1 && "stats-goal-glow",
							)}
						>
							<path
								d={path}
								fill="none"
								stroke="currentColor"
								strokeOpacity={0.14}
								strokeWidth={STROKE}
								strokeLinecap="round"
							/>
							{filled > 0 && (
								<path
									d={path}
									fill="none"
									stroke="currentColor"
									strokeWidth={STROKE}
									strokeLinecap="round"
									pathLength={1}
									strokeDasharray={`${filled} 1`}
									className="stats-arc-in transition-[stroke-dasharray] duration-700 ease-out-quart motion-reduce:transition-none"
								/>
							)}
						</g>
					);
				})}
			</svg>
			<div
				className={cn(
					"absolute inset-x-0 bottom-0 flex flex-col items-center px-10 text-center",
					arcs.length > 1 && "px-14",
				)}
			>
				{children}
			</div>
		</div>
	);
}
