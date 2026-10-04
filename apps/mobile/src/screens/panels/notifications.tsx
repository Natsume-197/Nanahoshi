import type { NotificationData } from "@nanahoshi/api/routers/notifications/notification.model";
import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { Stack } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Icon } from "@/components/icon";
import { icons } from "@/components/icon-names";
import { askChoice, showNotice } from "@/components/prompt";
import { RefreshControl } from "@/components/refresh-control";
import {
	EmptyState,
	ErrorState,
	OfflineState,
	RowSkeleton,
	waitingOffline,
} from "@/components/states";
import { Text } from "@/components/text";
import { formatRelativeTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { notificationContent } from "@/lib/notification-content";
import { IS_ANDROID } from "@/lib/platform";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";

const PAGE = 20;

/** Notifications as their own page (the web's phone layout, Storytel's too):
 * one row per finished task, unread ones marked, tap to mark read. */
export function NotificationsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
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
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.notifications.key() });
	const onError = () => showNotice(t("mobile.error.action"));
	const read = useMutation({
		...orpc.notifications.markRead.mutationOptions(),
		onSuccess: refresh,
		onError,
	});
	const readAll = useMutation({
		...orpc.notifications.markAllRead.mutationOptions(),
		onSuccess: refresh,
		onError,
	});
	const remove = useMutation({
		...orpc.notifications.delete.mutationOptions(),
		onSuccess: refresh,
		onError,
	});
	const removeAll = useMutation({
		...orpc.notifications.deleteAll.mutationOptions(),
		onSuccess: refresh,
		onError,
	});
	const rows = notifications.data?.pages.flat() ?? [];
	const hasUnread = rows.some((row) => row.readAt === null);
	const openMenu = async () => {
		const answer = await askChoice({
			title: t("notifications.title"),
			options: [
				...(hasUnread
					? [
							{
								id: "read",
								label: t("notifications.mark_all_read"),
								icon: icons.checkCircle,
							},
						]
					: []),
				{
					id: "delete",
					label: t("notifications.delete_all"),
					icon: icons.trash,
					destructive: true,
				},
			],
		});
		if (answer === "read") readAll.mutate({});
		if (answer === "delete") removeAll.mutate({});
	};
	const openRowMenu = async (id: number, title: string) => {
		const answer = await askChoice({
			title,
			options: [
				{
					id: "delete",
					label: t("notifications.delete"),
					icon: icons.trash,
					destructive: true,
				},
			],
		});
		if (answer === "delete") remove.mutate({ id });
	};

	return (
		<>
			<Stack.Screen
				options={{
					...(rows.length === 0
						? { headerRight: undefined, unstable_headerRightItems: undefined }
						: process.env.EXPO_OS === "ios"
							? {
									unstable_headerRightItems: () => [
										{
											type: "button",
											label: t("aria.more_actions"),
											icon: { type: "sfSymbol", name: "ellipsis.circle" },
											onPress: () => void openMenu(),
										},
									],
								}
							: {
									headerRight: () => (
										<Pressable
											accessibilityRole="button"
											accessibilityLabel={t("aria.more_actions")}
											onPress={() => void openMenu()}
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
												name={{ ios: "ellipsis.circle", android: "more_vert" }}
												size={24}
												color={palette.text}
											/>
										</Pressable>
									),
								}),
				}}
			/>
			{waitingOffline(notifications) ? (
				<OfflineState />
			) : notifications.isPending ? (
				<RowSkeleton count={6} />
			) : notifications.isError ? (
				<ErrorState onRetry={() => notifications.refetch()} />
			) : (
				<FlatList
					showsVerticalScrollIndicator={false}
					data={rows}
					keyExtractor={(item) => String(item.id)}
					contentInsetAdjustmentBehavior="automatic"
					refreshControl={
						<RefreshControl onRefresh={() => notifications.refetch()} />
					}
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
					contentContainerStyle={{
						paddingVertical: space.sm,
						paddingBottom: space.sm + miniPlayerInset,
					}}
					renderItem={({ item }) => (
						<NotificationRow
							data={item.payload as NotificationData}
							createdAt={item.createdAt}
							unread={item.readAt === null}
							onPress={() => read.mutate({ ids: [item.id] })}
							onLongPress={(title) => void openRowMenu(item.id, title)}
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
	onLongPress,
}: {
	data: NotificationData;
	createdAt: string | Date;
	unread: boolean;
	onPress: () => void;
	onLongPress: (title: string) => void;
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
			accessibilityActions={[
				{ name: "longpress", label: t("notifications.delete") },
			]}
			onAccessibilityAction={() => onLongPress(content.title)}
			onPress={unread ? onPress : undefined}
			onLongPress={() => onLongPress(content.title)}
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
