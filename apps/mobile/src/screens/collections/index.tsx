import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { CollectionMenuTarget } from "@/components/collection-menu";
import { CollectionRow } from "@/components/collection-row";
import { Icon, icons } from "@/components/icon";
import { LineTabs } from "@/components/line-tabs";
import { PageHeader } from "@/components/page-header";
import { PressableScale } from "@/components/pressable-scale";
import { RowSkeleton } from "@/components/states";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { shelfMeta } from "@/lib/shelves";
import { useApi } from "@/providers/app-provider";
import { radius, shadows, sizes, space, usePalette } from "@/theme";

type Format = "ebook" | "audiobook";

/**
 * The web's collections page on a phone: "Listas de libros / Listas de
 * audiolibros" line tabs; the four reading-status shelves, a separator, then
 * the user's collections — all as 80pt-mosaic rows — and a floating create
 * button.
 */
export function Collections() {
	const { orpc } = useApi();
	const palette = usePalette();
	const [format, setFormat] = useState<Format>("ebook");
	const shelves = useQuery(orpc.shelves.summaries.queryOptions());
	const collections = useQuery(orpc.collections.list.queryOptions());
	const loading = shelves.isPending || collections.isPending;
	const audio = format === "audiobook";

	const visibleCollections = (collections.data ?? []).filter((collection) => {
		// Dynamic collections have no stored counts; they match either format.
		if (collection.kind === "dynamic" || collection.ebookCount == null)
			return true;
		return audio
			? (collection.audiobookCount ?? 0) > 0
			: (collection.ebookCount ?? 0) > 0;
	});

	return (
		<View style={{ flex: 1 }}>
			<ScrollView
				contentInsetAdjustmentBehavior={
					process.env.EXPO_OS === "ios" ? "never" : "automatic"
				}
				contentContainerStyle={{ paddingBottom: 96 }}
				refreshControl={
					<RefreshControl
						refreshing={shelves.isRefetching || collections.isRefetching}
						onRefresh={() => {
							void shelves.refetch();
							void collections.refetch();
						}}
					/>
				}
			>
				<PageHeader title={t("nav.collections")} />
				<View
					style={{
						paddingHorizontal: space.lg,
						paddingTop: space.xl,
						gap: space.xl,
					}}
				>
					<LineTabs
						value={format}
						onChange={setFormat}
						options={[
							{ value: "ebook", label: t("collection.book_lists") },
							{ value: "audiobook", label: t("collection.audiobook_lists") },
						]}
					/>

					{loading ? (
						<RowSkeleton square count={6} />
					) : (
						<>
							<View style={{ gap: space.xs }}>
								{(shelves.data ?? []).map((shelf) => {
									const meta = shelfMeta(shelf.status, format);
									const count = audio ? shelf.audiobookCount : shelf.ebookCount;
									return (
										<CollectionRow
											key={shelf.status}
											href={{
												pathname: "/shelf/[status]",
												params: { status: shelf.status, format },
											}}
											name={meta.label}
											covers={
												audio
													? shelf.audiobookPreviewCovers
													: shelf.ebookPreviewCovers
											}
											fallbackIcon={meta.icon}
											subtitle={t("media.item_count", { count })}
										/>
									);
								})}
							</View>

							<View style={{ height: 1, backgroundColor: palette.separator }} />

							{visibleCollections.length > 0 ? (
								<View style={{ gap: space.xs }}>
									{visibleCollections.map((collection) => {
										const count = audio
											? collection.audiobookCount
											: collection.ebookCount;
										const covers = audio
											? collection.audiobookPreviewCovers
											: collection.ebookPreviewCovers;
										return (
											<CollectionMenuTarget
												key={collection.id}
												collection={{ ...collection, isOwner: true }}
											>
												{(onLongPress) => (
													<CollectionRow
														onLongPress={onLongPress}
														href={routes.collection(collection.id)}
														name={collection.name}
														covers={
															covers.length > 0
																? covers
																: collection.previewCovers
														}
														subtitle={
															count == null
																? "…"
																: t("media.item_count", { count })
														}
														dynamicLabel={
															collection.kind === "dynamic"
																? t("collection.dynamic")
																: null
														}
													/>
												)}
											</CollectionMenuTarget>
										);
									})}
								</View>
							) : (
								<View
									style={{
										borderRadius: radius.field,
										borderCurve: "continuous",
										backgroundColor: palette.surface,
										paddingHorizontal: 20,
										paddingVertical: space.xxl,
										gap: space.xs,
									}}
								>
									<Text variant="headline">
										{audio
											? t("collection.no_audiobook_collections_title")
											: t("collection.no_book_collections_title")}
									</Text>
									<Text variant="subhead" tone="secondary">
										{audio
											? t("collection.no_audiobook_collections_desc")
											: t("collection.no_book_collections_desc")}
									</Text>
								</View>
							)}
						</>
					)}
				</View>
			</ScrollView>

			<View style={{ position: "absolute", right: space.lg, bottom: space.xl }}>
				<PressableScale
					accessibilityRole="button"
					accessibilityLabel={t("collection.create_title")}
					onPress={() => router.push("/collection/new")}
					style={{
						width: sizes.fab,
						height: sizes.fab,
						borderRadius: radius.field,
						borderCurve: "continuous",
						alignItems: "center",
						justifyContent: "center",
						backgroundColor: palette.primary,
						boxShadow: shadows.raised,
					}}
				>
					<Icon name={icons.plus} size={22} color={palette.onPrimary} />
				</PressableScale>
			</View>
		</View>
	);
}
