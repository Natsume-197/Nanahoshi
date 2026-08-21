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
import {
	useHomeSectionLoadingPlaceholder,
	useReportHomeSectionStatus,
} from "./home-section-status";
import { resumeCardMeta } from "./resume-meta";
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
				mainColor: entry.mainColor,
			})),
			...(listeningQuery.data ?? []).map((entry) => {
				const duration =
					entry.durationSeconds != null && entry.durationSeconds > 0
						? entry.durationSeconds
						: entry.duration;
				return {
					key: `audiobook-${entry.bookUuid}`,
					mediaType: "audiobook" as const,
					uuid: entry.bookUuid,
					title: entry.title,
					filename: entry.bookFilename,
					cover: entry.cover,
					authors: entry.authors,
					progress: progressPercent(entry.currentTimeSeconds ?? 0, duration),
					lastActivityAt: entry.lastListenedAt,
					mainColor: entry.mainColor,
				};
			}),
		]
			.sort(
				(a, b) =>
					new Date(b.lastActivityAt ?? 0).getTime() -
					new Date(a.lastActivityAt ?? 0).getTime(),
			)
			.slice(0, DASHBOARD_LIMIT);
		const isLoading = readingQuery.isLoading || listeningQuery.isLoading;
		useReportHomeSectionStatus(
			isLoading ? "loading" : entries.length > 0 ? "populated" : "empty",
		);
		const showLoadingPlaceholder = useHomeSectionLoadingPlaceholder();

		if (isLoading) {
			return showLoadingPlaceholder ? <ResumeSectionSkeleton /> : null;
		}

		if (entries.length === 0) return null;

		return (
			<ScrollSection
				title={m["home.hero_continue"]()}
				layout="resume"
				restoreId="continue-all"
			>
				{entries.map((item, index) => (
					<BookContextMenuTrigger
						key={item.key}
						bookUuid={item.uuid}
						mediaType={item.mediaType}
						inContinueList
						className="min-w-0"
					>
						<BookCard
							uuid={item.uuid}
							title={item.title}
							filename={item.filename}
							cover={item.cover}
							authors={item.authors}
							mediaType={item.mediaType}
							meta={resumeCardMeta(item.mediaType, item.progress)}
							tint={item.mainColor}
							orientation="horizontal"
							contextMenuEnabled={false}
							priority={index === 0}
							coverPreset={coverPresets.small}
							compactTextBlock
							primaryAction="consume"
							showOverlayAction={false}
						/>
					</BookContextMenuTrigger>
				))}
			</ScrollSection>
		);
	},
);
