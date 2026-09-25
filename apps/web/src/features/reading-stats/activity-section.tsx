import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { m } from "@/paraglide/messages";
import { ActivityHeatmap } from "./activity-heatmap";
import { BookShareList } from "./book-share-list";
import {
	bookShares,
	finishedIn,
	heatmap,
	type StatsDay,
	type StatsView,
	secondsIn,
	sessionsIn,
} from "./stats-model";
import {
	CARD,
	formatDay,
	numberFormat,
	type Overview,
	Section,
	toneOf,
} from "./stats-shared";

function DayDetail({
	day,
	stats,
	data,
	view,
	onClose,
}: {
	day: string;
	stats: StatsDay | undefined;
	data: Overview;
	view: StatsView;
	onClose: () => void;
}) {
	const format = numberFormat();
	const shares = bookShares(data.bookDays, { from: day, to: day }, view).filter(
		(share) => share.seconds >= 60,
	);
	const facts = stats
		? [
				readingDuration(secondsIn(stats, view)),
				view !== "listening" && stats.characters > 0
					? m.stats_characters_value({ value: format.format(stats.characters) })
					: null,
				m.stats_sessions_value({ count: sessionsIn(stats, view) }),
				finishedIn(stats, view) > 0
					? m.stats_finished_value({ count: finishedIn(stats, view) })
					: null,
			].filter(Boolean)
		: [];
	return (
		<div
			aria-live="polite"
			className="fade-in slide-in-from-top-1 animate-in space-y-2 border-border/60 border-t pt-4 duration-200 motion-reduce:animate-none"
		>
			<div className="flex items-start justify-between gap-3 px-1">
				<div className="min-w-0">
					<p className="font-semibold first-letter:uppercase">
						{formatDay(day, {
							weekday: "long",
							day: "numeric",
							month: "long",
							year: "numeric",
						})}
					</p>
					<p className="text-muted-foreground text-sm">
						{facts.length > 0 ? facts.join(" · ") : m.stats_day_empty()}
					</p>
				</div>
				<Button
					variant="ghost"
					size="icon"
					aria-label={m.stats_day_close()}
					onClick={onClose}
				>
					<X aria-hidden="true" />
				</Button>
			</div>
			{shares.length > 0 && (
				<BookShareList shares={shares} books={data.books} />
			)}
		</div>
	);
}

export function ActivitySection({
	data,
	days,
	today,
	view,
	selected,
	onSelect,
}: {
	data: Overview;
	days: StatsDay[];
	today: string;
	view: StatsView;
	selected: string | null;
	onSelect: (day: string | null) => void;
}) {
	const weeks = heatmap(days, today, view);
	const activeDays = weeks.flat().filter((c) => c.seconds > 0).length;
	return (
		<Section
			title={m.stats_activity_title()}
			subtitle={m.stats_activity_subtitle()}
		>
			<div className={`${CARD} space-y-4`}>
				<ActivityHeatmap
					weeks={weeks}
					tone={toneOf(view)}
					activeDays={activeDays}
					selected={selected}
					onSelect={onSelect}
				/>
				{selected && (
					<DayDetail
						key={selected}
						day={selected}
						stats={days.find((d) => d.day === selected)}
						data={data}
						view={view}
						onClose={() => onSelect(null)}
					/>
				)}
			</div>
		</Section>
	);
}
