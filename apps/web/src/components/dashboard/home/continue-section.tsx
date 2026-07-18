import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";
import { ScrollSection } from "@/components/shared/scroll-section";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { m } from "@/paraglide/messages";
import { progressPercent } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { MAX_RESUME_TILES, ResumeTile } from "./resume-tile";
import { DASHBOARD_LIMIT, ResumeTileSectionSkeleton } from "./section-skeleton";

/** A mixed resume grid used by the All scope: compact Spotify-style tiles
 * sorted by last activity, both formats together. */
export const ContinueSection = memo(
	function ContinueSection(): JSX.Element | null {
		const readingQuery = useQuery(continueReadingQueryOptions());
		const listeningQuery = useQuery(
			orpc.listeningProgress.listInProgress.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);

		if (readingQuery.isLoading || listeningQuery.isLoading) {
			return <ResumeTileSectionSkeleton />;
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
			.slice(0, MAX_RESUME_TILES);

		if (entries.length === 0) return null;

		return (
			<ScrollSection title={m["home.recent"]()} layout="tiles">
				{entries.map(({ kind, entry }, index) => {
					if (kind === "ebook") {
						return (
							<BookContextMenuTrigger
								key={`ebook-${entry.bookUuid}`}
								bookUuid={entry.bookUuid}
								className="min-w-0"
							>
								<ResumeTile
									uuid={entry.bookUuid}
									title={entry.title}
									filename={entry.bookFilename}
									cover={entry.cover}
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
							className="min-w-0"
						>
							<ResumeTile
								uuid={entry.bookUuid}
								title={entry.title}
								filename={entry.bookFilename}
								cover={entry.cover}
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
