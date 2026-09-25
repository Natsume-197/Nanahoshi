import type { CSSProperties, ReactNode } from "react";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import type { client } from "@/utils/orpc";
import type { StatsGoals, StatsView } from "./stats-model";

export type Overview = Awaited<
	ReturnType<typeof client.readingSessions.overview>
>;
export type Medium = "reading" | "listening";

// Listening is the primary pushed toward the page's contrast side, so it reads as its own medium in both themes.
export const TONES = {
	"--stats-reading": "var(--primary)",
	"--stats-listening":
		"light-dark(color-mix(in oklab, var(--primary) 42%, var(--background)), color-mix(in oklab, var(--primary) 45%, var(--foreground)))",
	"--stats-empty": "color-mix(in oklab, var(--foreground) 7%, transparent)",
	"--stats-average": "color-mix(in oklab, var(--foreground) 55%, transparent)",
} as CSSProperties;
export const CARD =
	"rounded-3xl bg-[color-mix(in_oklab,var(--muted)_30%,var(--background))] p-5 sm:p-6";

export function numberFormat(options?: Intl.NumberFormatOptions) {
	return new Intl.NumberFormat(getLocale(), {
		useGrouping: "always",
		maximumFractionDigits: 0,
		...options,
	});
}
export const date = (day: string) => new Date(`${day}T00:00:00Z`);
export function formatDay(day: string, options: Intl.DateTimeFormatOptions) {
	return new Intl.DateTimeFormat(getLocale(), {
		...options,
		timeZone: "UTC",
	}).format(date(day));
}
export const shortDate = (day: string) =>
	formatDay(day, { day: "numeric", month: "short", year: "numeric" });

export const mediaOf = (view: StatsView): Medium[] =>
	view === "all" ? ["reading", "listening"] : [view];
export const toneOf = (view: StatsView): Medium =>
	view === "listening" ? "listening" : "reading";

export function goalText(medium: Medium, goals: StatsGoals, short = false) {
	const format = numberFormat();
	if (medium === "listening")
		return goals.listeningMinutes === null
			? null
			: m.stats_goal_minutes_value({
					value: format.format(goals.listeningMinutes),
				});
	if (goals.reading === null) return null;
	return goals.readingUnit === "characters"
		? (short ? m.stats_characters_short : m.stats_goal_characters_value)({
				value: format.format(goals.reading),
			})
		: m.stats_goal_minutes_value({ value: format.format(goals.reading) });
}

export function Section({
	title,
	subtitle,
	actions,
	children,
}: {
	title: string;
	subtitle?: string;
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="min-w-0 space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-3 px-1">
				<div className="min-w-0">
					<h2 className="font-semibold text-xl tracking-tight">{title}</h2>
					{subtitle && (
						<p className="text-muted-foreground text-sm first-letter:uppercase">
							{subtitle}
						</p>
					)}
				</div>
				{actions}
			</div>
			{children}
		</section>
	);
}

/** Roving focus for a row of chart marks: arrows step, Home/End jump. */
export function rovingKey(
	event: React.KeyboardEvent<HTMLElement>,
	steps: Partial<Record<string, number>>,
) {
	const step =
		event.key === "Home"
			? Number.NEGATIVE_INFINITY
			: event.key === "End"
				? Number.POSITIVE_INFINITY
				: steps[event.key];
	if (step === undefined) return;
	const items = [
		...(event.currentTarget.querySelectorAll<HTMLElement>(
			"[data-roving]:not([disabled])",
		) ?? []),
	];
	const index = items.indexOf(document.activeElement as HTMLElement);
	if (index < 0) return;
	event.preventDefault();
	const next =
		step === Number.NEGATIVE_INFINITY
			? 0
			: step === Number.POSITIVE_INFINITY
				? items.length - 1
				: Math.max(0, Math.min(items.length - 1, index + step));
	items[next]?.focus();
}
