import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { ActionMenuButton } from "@/components/action-menu";
import { ActionSheet } from "@/components/action-menu/action-sheet";
import { useCollectionMenu } from "@/components/collection-menu";
import { Icon, icons } from "@/components/icon";
import { SearchField } from "@/components/search-field";
import { Text } from "@/components/text";
import { TitleGrid } from "@/components/title-grid";
import type { TileItem } from "@/components/title-tile";
import { useCollectionOffline } from "@/downloads/offline-collections";
import { useActiveServerId, useDownloadedTitles } from "@/downloads/provider";
import { joinNames } from "@/lib/format";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { useApi } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";

const PAGE = 30;

/** The web's collection page: name as the title, "N items · description",
 * the owner when it isn't you, a search field and the items as a grid.
 * Owners get its actions in the header. */
export function CollectionDetail({ id }: { id: string }) {
	const palette = usePalette();
	const router = useRouter();
	const { orpc } = useApi();
	const [query, setQuery] = useState("");
	const [menuOpen, setMenuOpen] = useState(false);
	const details = useQuery(
		orpc.collections.getDetails.queryOptions({
			input: { collectionId: id },
			staleTime: 30_000,
		}),
	);
	const items = useInfiniteQuery(
		orpc.collections.listItems.infiniteOptions({
			input: (cursor: number) => ({
				collectionId: id,
				cursor,
				limit: PAGE,
				query: query || undefined,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			}),
			initialPageParam: 0,
			getNextPageParam: (last) => last.pagination.nextCursor,
			staleTime: 30_000,
		}),
	);
	const collection = details.data?.collection;
	const tiles: TileItem[] = (
		items.data?.pages.flatMap((page) => page.items) ?? []
	).map((item) => ({
		uuid: item.uuid,
		kind: item.mediaType === "audiobook" ? "audiobook" : "book",
		title: item.title ?? null,
		cover: item.cover ?? null,
		color: item.mainColor ?? null,
		subtitle: joinNames(item.authors ?? []),
	}));
	const total =
		items.data?.pages[0]?.pagination.totalHits ?? collection?.bookCount ?? 0;
	const invalid = items.data?.pages[0]?.definitionStatus === "invalid";

	// Owners manage their collection from the header: the same actions as a
	// long-press on its row in the list.
	const actions = useCollectionMenu(collection, { onDeleted: router.back });

	return (
		<>
			<Stack.Screen
				options={{
					title: collection?.name ?? t("nav.collections"),
					headerRight:
						actions.length > 0
							? () =>
									IS_ANDROID ? (
										<Pressable
											onPress={() => setMenuOpen(true)}
											hitSlop={10}
											accessibilityRole="button"
											accessibilityLabel={t("nav.more")}
										>
											<Icon name={icons.more} size={22} color={palette.text} />
										</Pressable>
									) : (
										<ActionMenuButton
											sections={actions}
											icon={icons.more}
											label={t("nav.more")}
											color={palette.text}
											size={22}
										/>
									)
							: undefined,
				}}
			/>
			<TitleGrid
				items={tiles}
				query={{
					...items,
					isPending: items.isPending || details.isPending,
					isError: items.isError || details.isError,
					refetch: () => {
						void details.refetch();
						return items.refetch();
					},
				}}
				emptyTitle={
					query
						? t("settings.no_matches")
						: invalid
							? t(
									collection?.isOwner
										? "collection.detail_rules_repair_title"
										: "collection.unavailable_title",
								)
							: t("collection.detail_empty_title")
				}
				emptyMessage={
					query
						? t("collection.detail_empty_search_desc")
						: invalid
							? t(
									collection?.isOwner
										? "collection.detail_rules_repair_desc"
										: "collection.detail_unavailable_desc",
								)
							: collection?.kind === "dynamic"
								? t("collection.detail_empty_dynamic_desc")
								: t("collection.detail_empty_manual_desc")
				}
				header={
					collection ? (
						<View
							style={{
								gap: space.md,
								paddingTop: space.xs,
								paddingBottom: space.lg,
								paddingHorizontal: space.sm / 2,
							}}
						>
							<Text variant="subhead" tone="secondary" selectable>
								{[
									t("media.item_count", { count: total }),
									collection.description,
								]
									.filter(Boolean)
									.join(" · ")}
							</Text>
							<OfflineStatus collectionId={id} total={total} />
							{!collection.isOwner ? (
								<Text variant="label" tone="secondary">
									@{collection.ownerUsername}
								</Text>
							) : null}
							{total > 0 || query ? (
								<SearchField
									placeholder={t("collection.detail_search_placeholder")}
									onQuery={setQuery}
								/>
							) : null}
						</View>
					) : null
				}
			/>
			{menuOpen ? (
				<ActionSheet sections={actions} onClose={() => setMenuOpen(false)} />
			) : null}
		</>
	);
}

/** Kept offline: how much of the collection is already on the phone. */
function OfflineStatus({
	collectionId,
	total,
}: {
	collectionId: string;
	total: number;
}) {
	const palette = usePalette();
	const serverId = useActiveServerId();
	const offline = useCollectionOffline(serverId, collectionId);
	const { titles } = useDownloadedTitles();
	if (!offline) return null;
	const onPhone = titles.filter(
		(title) =>
			title.complete &&
			title.reasons?.some(
				(reason) => reason.type === "collection" && reason.id === collectionId,
			),
	).length;
	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
			<Icon name={icons.downloaded} size={16} color={palette.textSecondary} />
			<Text variant="label" tone="secondary">
				{onPhone >= total
					? t("mobile.collections.offline_ready")
					: t("mobile.collections.offline_progress", { done: onPhone, total })}
			</Text>
		</View>
	);
}
