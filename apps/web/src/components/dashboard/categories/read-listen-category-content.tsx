import type { ReadListenPairing } from "@nanahoshi-v2/api/routers/read-listen/read-listen.service";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { type JSX, memo, type ReactNode } from "react";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { PairGridCard } from "@/components/read-listen/read-listen-catalog-page";
import { EmptyState } from "@/components/shared/empty-state";
import { ScrollSection } from "@/components/shared/scroll-section";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { PAGE_GUTTER } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import {
	DASHBOARD_BOOK_TILE_CLASS,
	DASHBOARD_LIMIT,
	SectionSkeleton,
} from "../home/section-skeleton";
import { partitionReadListenRails } from "./read-listen-rails";

const CATEGORY_SHELL_CLASS = "relative flex flex-col pt-3 pb-8 md:pt-4";
const CATEGORY_STACK_CLASS = "flex flex-col gap-8 md:gap-12";
const RECENT_PAIRING_LIMIT = Math.ceil(DASHBOARD_LIMIT / 2);

function PairingRail({
	title,
	restoreId,
	pairings,
}: {
	title: ReactNode;
	restoreId: string;
	pairings: readonly ReadListenPairing[];
}): JSX.Element | null {
	if (pairings.length === 0) return null;

	return (
		<ScrollSection title={title} restoreId={restoreId}>
			{pairings.map((pairing) => (
				<BookContextMenuTrigger
					key={pairing.id}
					bookUuid={pairing.audiobook.uuid}
					mediaType="audiobook"
				>
					<div className={DASHBOARD_BOOK_TILE_CLASS}>
						<PairGridCard pairing={pairing} />
					</div>
				</BookContextMenuTrigger>
			))}
		</ScrollSection>
	);
}

export const ReadListenCategoryContent = memo(
	function ReadListenCategoryContent(): JSX.Element {
		const pairingsQuery = useInfiniteQuery({
			...orpc.readListen.listPairings.infiniteOptions({
				input: (pageParam: number) => ({
					offset: pageParam,
					limit: DASHBOARD_LIMIT * 3,
					alignment: "ready",
				}),
				initialPageParam: 0,
				getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
			}),
			staleTime: 60_000,
		});
		const readingQuery = useQuery(continueReadingQueryOptions());
		const listeningQuery = useQuery(
			orpc.listeningProgress.listInProgress.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		const pairings = pairingsQuery.data?.pages[0]?.items ?? [];
		const ebookActivity = new Map(
			(readingQuery.data ?? []).map((entry) => [
				entry.bookUuid,
				new Date(entry.lastReadAt ?? 0).getTime(),
			]),
		);
		const audiobookActivity = new Map(
			(listeningQuery.data ?? []).map((entry) => [
				entry.bookUuid,
				new Date(entry.lastListenedAt ?? 0).getTime(),
			]),
		);
		const activityById = new Map(
			pairings.flatMap((pairing) => {
				const lastActivity = Math.max(
					ebookActivity.get(pairing.ebook.uuid) ?? 0,
					audiobookActivity.get(pairing.audiobook.uuid) ?? 0,
				);
				return lastActivity > 0 ? [[pairing.id, lastActivity] as const] : [];
			}),
		);
		const { continueItems, recentItems, availableItems } =
			partitionReadListenRails({
				items: pairings,
				activityById,
				limit: DASHBOARD_LIMIT,
				recentLimit: RECENT_PAIRING_LIMIT,
			});
		const isLoading =
			pairingsQuery.isLoading ||
			readingQuery.isLoading ||
			listeningQuery.isLoading;

		return (
			<BookContextMenuRoot mediaType="audiobook">
				<div className={cn(PAGE_GUTTER, CATEGORY_SHELL_CLASS)}>
					<div className={CATEGORY_STACK_CLASS}>
						{isLoading ? (
							<>
								<SectionSkeleton />
								<SectionSkeleton />
								<SectionSkeleton />
							</>
						) : pairings.length > 0 ? (
							<>
								<PairingRail
									title={m["home.hero_continue"]()}
									restoreId="read-listen-continue"
									pairings={continueItems}
								/>
								<PairingRail
									title={m["home.recently_added"]()}
									restoreId="read-listen-recent"
									pairings={recentItems}
								/>
								<PairingRail
									title={m["read_listen.status_ready"]()}
									restoreId="read-listen-available"
									pairings={availableItems}
								/>
							</>
						) : (
							<EmptyState
								title={m["read_listen.empty_title"]()}
								description={m["read_listen.empty_description"]()}
							/>
						)}
					</div>
				</div>
			</BookContextMenuRoot>
		);
	},
);
