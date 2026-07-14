import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";
import { ScrollSection } from "@/components/shared/scroll-section";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { m } from "@/paraglide/messages";
import { progressPercent } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { ResumeCard } from "./resume-card";
import { DASHBOARD_LIMIT, ResumeSectionSkeleton } from "./section-skeleton";

/** A mixed resume row used by the All scope. ResumeCard keeps a consistent
 * outer width while preserving each format's native cover ratio. */
export const ContinueSection = memo(
	function ContinueSection(): JSX.Element | null {
		const readingQuery = useQuery(continueReadingQueryOptions());
		const listeningQuery = useQuery(
			orpc.listeningProgress.listInProgress.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);

		if (readingQuery.isLoading || listeningQuery.isLoading) {
			return <ResumeSectionSkeleton />;
		}

		const entries = [
			...(readingQuery.data ?? []).map((entry) => ({
				kind: "ebook" as const,
				entry,
				lastActivityAt: entry.lastReadAt,
			})),
			...(listeningQuery.data ?? []).map((entry) => ({
				kind: "audiobook" as const,
				entry,
				lastActivityAt: entry.lastListenedAt,
			})),
		]
			.sort(
				(a, b) =>
					new Date(b.lastActivityAt ?? 0).getTime() -
					new Date(a.lastActivityAt ?? 0).getTime(),
			)
			.slice(0, DASHBOARD_LIMIT);

		if (entries.length === 0) return null;

		return (
			<ScrollSection title={m["home.hero_continue"]()} centerArrows>
				{entries.map(({ kind, entry }, index) => {
					if (kind === "ebook") {
						return (
							<BookContextMenuTrigger
								key={`ebook-${entry.bookUuid}`}
								bookUuid={entry.bookUuid}
								className="shrink-0"
							>
								<ResumeCard
									uuid={entry.bookUuid}
									title={entry.title}
									filename={entry.bookFilename}
									cover={entry.cover}
									authors={entry.authors}
									mainColor={entry.mainColor}
									priority={index === 0}
									progress={progressPercent(
										entry.exploredCharCount,
										entry.bookCharCount,
									)}
									exploredCharCount={entry.exploredCharCount}
									bookCharCount={entry.bookCharCount}
									lastActivityAt={entry.lastReadAt}
								/>
							</BookContextMenuTrigger>
						);
					}

					const duration =
						entry.durationSeconds != null && entry.durationSeconds > 0
							? entry.durationSeconds
							: entry.duration;
					const currentTime = entry.currentTimeSeconds ?? 0;
					return (
						<BookContextMenuTrigger
							key={`audiobook-${entry.bookUuid}`}
							bookUuid={entry.bookUuid}
							mediaType="audiobook"
							className="shrink-0"
						>
							<ResumeCard
								uuid={entry.bookUuid}
								title={entry.title}
								filename={entry.bookFilename}
								cover={entry.cover}
								authors={entry.authors}
								mainColor={entry.mainColor}
								priority={index === 0}
								progress={progressPercent(currentTime, duration)}
								positionSeconds={currentTime}
								totalSeconds={duration}
								lastActivityAt={entry.lastListenedAt}
								mediaType="audiobook"
							/>
						</BookContextMenuTrigger>
					);
				})}
			</ScrollSection>
		);
	},
);
