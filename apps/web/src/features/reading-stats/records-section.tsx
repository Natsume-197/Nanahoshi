import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import {
	bestDay,
	type FinishedBook,
	fastestFinish,
	mostCharactersDay,
	type StatsDay,
	type StatsView,
	secondsIn,
} from "./stats-model";
import {
	type Medium,
	mediaOf,
	numberFormat,
	type Overview,
	Section,
	shortDate,
} from "./stats-shared";

interface RecordRow {
	label: string;
	value: string;
	detail: string | null;
}

export function RecordsSection({
	data,
	days,
	view,
}: {
	data: Overview;
	days: StatsDay[];
	view: StatsView;
}) {
	const format = numberFormat();
	// Sessions carry an instant; show it on the reader's own calendar.
	const localDate = new Intl.DateTimeFormat(getLocale(), {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
	const titleOf = (book: number) =>
		data.books[book]?.title ?? m.stats_book_unavailable();
	const records: RecordRow[] = [];
	for (const medium of mediaOf(view) as Medium[]) {
		const longest = data.longestSession[medium];
		if (!longest) continue;
		records.push({
			label:
				medium === "reading"
					? m.stats_record_longest_reading()
					: m.stats_record_longest_listening(),
			value: readingDuration(longest.seconds),
			detail: `${titleOf(longest.book)} · ${localDate.format(new Date(longest.startedAt))}`,
		});
	}
	const best = bestDay(days, view);
	if (best)
		records.push({
			label: m.stats_record_best_day(),
			value: readingDuration(secondsIn(best, view)),
			detail: shortDate(best.day),
		});
	const mostCharacters = view === "listening" ? null : mostCharactersDay(days);
	if (mostCharacters)
		records.push({
			label: m.stats_record_most_characters(),
			value: format.format(mostCharacters.characters),
			detail: shortDate(mostCharacters.day),
		});
	const fastest = fastestFinish(data.finished as FinishedBook[], view);
	if (fastest)
		records.push({
			label: m.stats_record_fastest(),
			value: m.stats_days_value({ count: fastest.days }),
			detail: titleOf(fastest.book),
		});
	if (records.length === 0) return null;
	return (
		<Section title={m.stats_records_title()}>
			<dl
				className={cn(
					"grid @3xl:grid-cols-3 grid-cols-2 gap-px overflow-hidden rounded-3xl bg-border/50",
					"[&>:last-child:nth-child(odd)]:col-span-2",
				)}
			>
				{records.map((record) => (
					<div
						key={record.label}
						className="min-w-0 space-y-1 bg-[color-mix(in_oklab,var(--muted)_30%,var(--background))] px-5 py-4"
					>
						<dt className="truncate text-muted-foreground text-xs">
							{record.label}
						</dt>
						<dd className="truncate font-semibold text-xl tabular-nums tracking-tight">
							{record.value}
						</dd>
						{record.detail && (
							<dd className="line-clamp-2 text-muted-foreground text-xs">
								{record.detail}
							</dd>
						)}
					</div>
				))}
			</dl>
		</Section>
	);
}
