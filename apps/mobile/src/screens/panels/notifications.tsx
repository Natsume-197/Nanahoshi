import type { NotificationData } from "@nanahoshi/api/routers/notifications/notification.model";
import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { Stack } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import { showNotice } from "@/components/prompt";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/states";
import { Text } from "@/components/text";
import { formatRelativeTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { notificationContent } from "@/lib/notification-content";
import { IS_ANDROID } from "@/lib/platform";
import { useApi } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";

const PAGE = 20;

/** Notifications as their own page (the web's phone layout, Storytel's too):
 * one row per finished task, unread ones marked, tap to mark read. */
export function NotificationsScreen() {
	const { orpc } = useApi();
	const queryClient = useQueryClient();
	const palette = usePalette();
	const notifications = useInfiniteQuery(
		orpc.notifications.list.infiniteOptions({
			input: (cursor: number | undefined) => ({ limit: PAGE, cursor }),
			initialPageParam: undefined,
			getNextPageParam: (last) =>
				last.length === PAGE ? last[last.length - 1]?.id : undefined,
		}),
	);
	const read = useMutation({
		...orpc.notifications.markRead.mutationOptions(),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: orpc.notifications.key() }),
		onError: () => showNotice(t("common.error")),
	});
	const rows = notifications.data?.pages.flat() ?? [];
	const unreadIds = rows
		.filter((row) => row.readAt === null)
		.map((row) => row.id)
		.slice(0, 100);
	const markAll = () => read.mutate({ ids: unreadIds });

	return (
		<>
			<Stack.Screen
				options={{
					...(unreadIds.length === 0
						? {}
						: process.env.EXPO_OS === "ios"
							? {
									unstable_headerRightItems: () => [
										{
											type: "button",
											label: t("notifications.mark_all_read"),
											icon: { type: "sfSymbol", name: "checkmark.circle" },
											onPress: markAll,
										},
									],
								}
							: {
									headerRight: () => (
										<Pressable
											accessibilityRole="button"
											accessibilityLabel={t("notifications.mark_all_read")}
											onPress={markAll}
											android_ripple={{
												color: palette.ripple,
												borderless: true,
												radius: 20,
											}}
											style={{
												width: 48,
												height: 48,
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											<Icon
												name={{ ios: "checkmark.circle", android: "done_all" }}
												size={24}
												color={palette.text}
											/>
										</Pressable>
									),
								}),
				}}
			/>
			{notifications.isPending ? (
				<RowSkeleton count={6} />
			) : notifications.isError ? (
				<ErrorState onRetry={() => notifications.refetch()} />
			) : (
				<FlatList
					data={rows}
					keyExtractor={(item) => String(item.id)}
					contentInsetAdjustmentBehavior="automatic"
					refreshing={notifications.isRefetching}
					onRefresh={() => void notifications.refetch()}
					onEndReached={() => {
						if (notifications.hasNextPage && !notifications.isFetchingNextPage)
							void notifications.fetchNextPage();
					}}
					ListEmptyComponent={
						<EmptyState
							icon={{ ios: "bell", android: "notifications" }}
							title={t("notifications.empty")}
							message={t("notifications.empty_desc")}
						/>
					}
					contentContainerStyle={{ paddingVertical: space.sm }}
					renderItem={({ item }) => (
						<NotificationRow
							data={item.payload as NotificationData}
							createdAt={item.createdAt}
							unread={item.readAt === null}
							onPress={() => read.mutate({ ids: [item.id] })}
						/>
					)}
				/>
			)}
		</>
	);
}

function NotificationRow({
	data,
	createdAt,
	unread,
	onPress,
}: {
	data: NotificationData;
	createdAt: string | Date;
	unread: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	const content = notificationContent(data, t);
	const meta = [content.detail, formatRelativeTime(createdAt)]
		.filter(Boolean)
		.join(" · ");
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={
				unread
					? t("notifications.mark_read", { title: content.title })
					: content.title
			}
			accessibilityState={{ disabled: !unread }}
			disabled={!unread}
			onPress={onPress}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "flex-start",
				gap: space.lg,
				paddingHorizontal: space.lg,
				paddingVertical: space.md,
				backgroundColor:
					pressed && !IS_ANDROID ? palette.surface : "transparent",
			})}
		>
			<View
				style={{
					width: 40,
					height: 40,
					borderRadius: 20,
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: palette.surface,
				}}
			>
				<Icon
					name={content.icon}
					size={20}
					color={content.failed ? palette.danger : palette.textSecondary}
				/>
			</View>
			<View style={{ flex: 1, gap: 2 }}>
				<Text
					variant="body"
					numberOfLines={3}
					style={{ fontWeight: unread ? "600" : "400" }}
				>
					{content.title}
				</Text>
				<Text variant="caption" tone="secondary" numberOfLines={2}>
					{meta}
				</Text>
				{data.error ? (
					<Text variant="caption" tone="danger" numberOfLines={3} selectable>
						{data.error}
					</Text>
				) : null}
			</View>
			{unread ? (
				<View
					accessibilityLabel={t("notifications.unread")}
					style={{
						width: 8,
						height: 8,
						borderRadius: 4,
						marginTop: 8,
						backgroundColor: palette.primary,
					}}
				/>
			) : null}
		</Pressable>
	);
}
