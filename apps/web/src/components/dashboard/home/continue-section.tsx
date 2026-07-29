import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookContextMenuTrigger } from "@/components/books/book-context-menu";
import { ScrollSection } from "@/components/shared/scroll-section";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { progressPercent } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { resumeMeta } from "./resume-meta";
import { DASHBOARD_LIMIT, ResumeSectionSkeleton } from "./section-skeleton";

/** Resume rail used by the All scope: both formats, newest activity first. */
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
				key: `ebook-${entry.bookUuid}`,
				mediaType: "ebook" as const,
				uuid: entry.bookUuid,
				title: entry.title,
				filename: entry.bookFilename,
				cover: entry.cover,
				authors: entry.authors,
				progress: progressPercent(entry.exploredCharCount, entry.bookCharCount),
				lastActivityAt: entry.lastReadAt,
			})),
			...(listeningQuery.data ?? []).map((entry) => ({
				key: `audiobook-${entry.bookUuid}`,
				mediaType: "audiobook" as const,
				uuid: entry.bookUuid,
				title: entry.title,
				filename: entry.bookFilename,
				cover: entry.cover,
				authors: entry.authors,
				progress: progressPercent(
					entry.currentTimeSeconds ?? 0,
					entry.durationSeconds != null && entry.durationSeconds > 0
						? entry.durationSeconds
						: entry.duration,
				),
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
			<ScrollSection
				title={m["home.hero_continue"]()}
				showAllHref="/dashboard/recent"
				layout="resume"
				restoreId="continue-all"
			>
				{entries.map((item, index) => (
					<BookContextMenuTrigger
						key={item.key}
						bookUuid={item.uuid}
						mediaType={item.mediaType}
						className="min-w-0"
					>
						<BookCard
							uuid={item.uuid}
							title={item.title}
							filename={item.filename}
							cover={item.cover}
							authors={item.authors}
							mediaType={item.mediaType}
							progress={item.progress}
							meta={resumeMeta(item.progress, item.lastActivityAt)}
							orientation="horizontal"
							contextMenuEnabled={false}
							priority={index === 0}
							coverPreset={coverPresets.small}
							compactTextBlock
						/>
					</BookContextMenuTrigger>
				))}
			</ScrollSection>
		);
	},
);
