import { TrendDown, TrendUp } from "@phosphor-icons/react";
import { readingDuration } from "@/features/reading-sessions/reading-duration";
import {
	addDays,
	niceMaximum,
} from "@/features/reading-sessions/reading-history-model";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { HoverTip } from "./hover-tip";
import { paceOf, paceSeries, type StatsDay } from "./stats-model";
import { CARD, formatDay, numberFormat, Section } from "./stats-shared";

/** Characters per hour over time: the number that tells a learner they are getting faster. */
export function PaceSection({
	days,
	today,
}: {
	days: StatsDay[];
	today: string;
}) {
	const { unit, points } = paceSeries(days, today);
	const measured = points.filter((p) => p.pace !== null);
	if (measured.length === 0) return null;
	const format = numberFormat();
	const compact = numberFormat({
		notation: "compact",
		maximumFractionDigits: 1,
	});
	const percent = numberFormat({ style: "percent" });
	const recent = paceOf(days.filter((d) => d.day > addDays(today, -30)));
	const firstPoint = measured[0];
	const lastPoint = measured.at(-1);
	const change =
		measured.length > 1 && firstPoint?.pace && lastPoint?.pace
			? (lastPoint.pace - firstPoint.pace) / firstPoint.pace
			: null;
	const max = niceMaximum(Math.max(...measured.map((p) => p.pace ?? 0)));
	const bucketLabel = (from: string) =>
		unit === "month"
			? formatDay(from, { month: "long", year: "numeric" })
			: m.stats_pace_week_of({
					date: formatDay(from, { day: "numeric", month: "short" }),
				});
	const tick = (from: string) =>
		unit === "month"
			? formatDay(from, { month: "short" })
			: formatDay(from, { day: "numeric", month: "numeric" });
	return (
		<Section title={m.stats_pace_title()} subtitle={m.stats_pace_subtitle()}>
			<div className={cn(CARD, "space-y-5")}>
				<div className="space-y-1">
					<p className="text-muted-foreground text-sm">
						{m.stats_pace_recent()}
					</p>
					<p className="font-semibold text-3xl tabular-nums tracking-tight">
						{m.stats_speed_value({
							value: format.format(recent ?? lastPoint?.pace ?? 0),
						})}
					</p>
					{change !== null && firstPoint && (
						<p className="flex flex-wrap items-center gap-x-1 text-sm">
							{change >= 0 ? (
								<TrendUp aria-hidden="true" className="size-4" />
							) : (
								<TrendDown aria-hidden="true" className="size-4" />
							)}
							<span className="tabular-nums">
								{change >= 0 ? "+" : "−"}
								{percent.format(Math.abs(change))}
							</span>
							<span className="text-muted-foreground">
								{m.stats_pace_since({ period: bucketLabel(firstPoint.from) })}
							</span>
						</p>
					)}
				</div>
				<HoverTip>
					<ol
						aria-label={m.stats_pace_title()}
						className="flex h-44 items-end gap-1.5 sm:gap-3"
					>
						{points.map((p) => (
							<li
								key={p.key}
								aria-label={`${bucketLabel(p.from)}: ${
									p.pace === null
										? m.stats_pace_unmeasured()
										: m.stats_speed_value({ value: format.format(p.pace) })
								}`}
								data-tip={bucketLabel(p.from)}
								data-tip-detail={
									p.pace === null
										? m.stats_pace_unmeasured()
										: `${m.stats_speed_value({ value: format.format(p.pace) })} · ${readingDuration(p.seconds)}`
								}
								className="group/pace flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
							>
								{p.pace !== null && (
									<span
										aria-hidden="true"
										className="text-[10px] text-muted-foreground tabular-nums sm:text-xs"
									>
										{compact.format(p.pace)}
									</span>
								)}
								<span
									aria-hidden="true"
									className={cn(
										"w-full max-w-10 rounded-t-[5px] bg-[var(--stats-reading)]",
										p === lastPoint ? "opacity-100" : "opacity-55",
										"transition-opacity group-hover/pace:opacity-100",
										p.pace === null &&
											"h-[3px] bg-[var(--stats-empty)] opacity-100",
									)}
									style={
										p.pace === null
											? undefined
											: { height: `max(3px, ${(p.pace / max) * 80}%)` }
									}
								/>
								<span
									aria-hidden="true"
									className="w-full truncate text-center text-muted-foreground text-xs tabular-nums"
								>
									{tick(p.from)}
								</span>
							</li>
						))}
					</ol>
				</HoverTip>
				<p className="text-muted-foreground text-xs">{m.stats_pace_hint()}</p>
			</div>
		</Section>
	);
}
