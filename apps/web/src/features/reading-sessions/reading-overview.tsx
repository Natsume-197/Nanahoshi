import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Apple-style activity ring: how much of today's target is done. Past 100 % it stays full. */
export function ProgressRing({
	ratio,
	size = 88,
	children,
}: {
	ratio: number;
	size?: number;
	children?: ReactNode;
}) {
	const stroke = 9;
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;
	const filled = Math.max(0, Math.min(1, ratio));
	return (
		<div
			className="relative grid shrink-0 place-items-center"
			style={{ width: size, height: size }}
		>
			<svg
				aria-hidden="true"
				width={size}
				height={size}
				className="-rotate-90 text-primary"
			>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeOpacity="0.15"
					strokeWidth={stroke}
				/>
				{filled > 0 && (
					<circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						fill="none"
						stroke="currentColor"
						strokeWidth={stroke}
						strokeLinecap="round"
						strokeDasharray={`${filled * circumference} ${circumference}`}
						className="transition-[stroke-dasharray] duration-500 motion-reduce:transition-none"
					/>
				)}
			</svg>
			<div className="absolute inset-0 grid place-items-center text-center">
				{children}
			</div>
		</div>
	);
}

export interface Figure {
	label: string;
	value: string;
	detail?: string;
}

/**
 * Summary figures in one card split by hairlines, like Apple's summary tiles:
 * the gaps between cells show the card's border colour through.
 */
export function FigureGrid({
	figures,
	className,
}: {
	figures: Figure[];
	className?: string;
}) {
	return (
		<dl
			className={cn(
				"grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-border/50",
				// An odd last tile spans the row, so the grid never shows an empty cell.
				"[&>:last-child:nth-child(odd)]:col-span-2",
				figures.length > 4 ? "@3xl:grid-cols-3" : "@3xl:grid-cols-4",
				className,
			)}
		>
			{figures.map((figure) => (
				<div
					key={figure.label}
					className="min-w-0 space-y-1 bg-[color-mix(in_oklab,var(--muted)_30%,var(--background))] px-5 py-4"
				>
					<dt className="truncate text-muted-foreground text-xs">
						{figure.label}
					</dt>
					<dd className="truncate font-semibold text-xl tabular-nums tracking-tight">
						{figure.value}
					</dd>
					{figure.detail && (
						<dd className="line-clamp-2 text-muted-foreground text-xs">
							{figure.detail}
						</dd>
					)}
				</div>
			))}
		</dl>
	);
}
