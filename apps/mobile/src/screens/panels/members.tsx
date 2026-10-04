import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, SectionList, View } from "react-native";
import { RefreshControl } from "@/components/refresh-control";
import {
	EmptyState,
	ErrorState,
	OfflineState,
	RowSkeleton,
	waitingOffline,
} from "@/components/states";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { IS_ANDROID } from "@/lib/platform";
import { routes } from "@/lib/routes";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi, useConnection } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";

/** The web's presence dots (components/shared/presence-dot.tsx). */
const PRESENCE_DOT: Record<string, string> = {
	reading: "#0ea5e9",
	listening: "#8b5cf6",
	read_listen: "#d946ef",
	away: "#f59e0b",
	online: "#10b981",
};

/** Friends activity as its own page: who's online (and what they're reading
 * or listening to) above who's offline, like the web's members list. */
export function MembersScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const { orpc } = useApi();
	const members = useQuery({
		...orpc.members.withPresence.queryOptions(),
		refetchInterval: 30_000,
	});
	const all = members.data ?? [];
	const online = all.filter((member) => member.state !== "offline");
	const offline = all.filter((member) => member.state === "offline");
	const sections = [
		{
			key: "online",
			title: t("members.online_group", { count: online.length }),
			data: online,
		},
		{
			key: "offline",
			title: t("members.offline_group", { count: offline.length }),
			data: offline,
		},
	].filter((section) => section.data.length > 0);

	return (
		<>
			{waitingOffline(members) ? (
				<OfflineState />
			) : members.isPending ? (
				<RowSkeleton count={6} square />
			) : members.isError ? (
				<ErrorState onRetry={() => members.refetch()} />
			) : (
				<SectionList
					sections={sections}
					keyExtractor={(item) => item.id}
					contentInsetAdjustmentBehavior="automatic"
					stickySectionHeadersEnabled={false}
					refreshControl={
						<RefreshControl onRefresh={() => members.refetch()} />
					}
					contentContainerStyle={{ paddingBottom: space.lg + miniPlayerInset }}
					ListEmptyComponent={
						<EmptyState
							icon={{ ios: "person.2", android: "group" }}
							title={t("members.empty")}
						/>
					}
					renderSectionHeader={({ section }) => (
						<SectionTitle>{section.title}</SectionTitle>
					)}
					renderItem={({ item }) => <MemberRow member={item} />}
				/>
			)}
		</>
	);
}

function SectionTitle({ children }: { children: string }) {
	return (
		<Text
			variant="metaLabel"
			tone="secondary"
			accessibilityRole="header"
			style={{
				paddingHorizontal: space.lg,
				paddingTop: space.lg,
				paddingBottom: space.sm,
				textTransform: "uppercase",
				letterSpacing: 0.6,
			}}
		>
			{children}
		</Text>
	);
}

type Member = {
	id: string;
	name: string;
	username?: string | null;
	image?: string | null;
	state: string;
	book?: { title?: string | null } | null;
};

function MemberRow({ member }: { member: Member }) {
	const palette = usePalette();
	const { serverUrl } = useConnection();
	const image = mediaUrl(serverUrl, member.image);
	const dot = PRESENCE_DOT[member.state];
	const activity = member.book?.title;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={
				activity ? `${member.name}, ${activity}` : member.name
			}
			disabled={!member.username}
			onPress={() =>
				member.username && router.push(routes.user(member.username))
			}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.lg,
				paddingHorizontal: space.lg,
				paddingVertical: space.sm,
				minHeight: 64,
				backgroundColor:
					pressed && !IS_ANDROID ? palette.surface : "transparent",
			})}
		>
			<View style={{ opacity: member.state === "offline" ? 0.6 : 1 }}>
				<View
					style={{
						width: 44,
						height: 44,
						borderRadius: 22,
						overflow: "hidden",
						backgroundColor: palette.surface,
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					{image ? (
						<Image
							source={{ uri: image }}
							style={{ width: 44, height: 44 }}
							contentFit="cover"
						/>
					) : (
						<Text variant="headline">
							{member.name.slice(0, 1).toUpperCase()}
						</Text>
					)}
				</View>
				{dot ? (
					<View
						style={{
							position: "absolute",
							right: -1,
							bottom: -1,
							width: 14,
							height: 14,
							borderRadius: 7,
							borderWidth: 2,
							borderColor: palette.background,
							backgroundColor: dot,
						}}
					/>
				) : null}
			</View>
			<View
				style={{
					flex: 1,
					gap: 2,
					opacity: member.state === "offline" ? 0.6 : 1,
				}}
			>
				<Text variant="body" numberOfLines={1} style={{ fontWeight: "600" }}>
					{member.name}
				</Text>
				{activity ? (
					<Text variant="caption" tone="secondary" numberOfLines={1}>
						{activity}
					</Text>
				) : null}
			</View>
		</Pressable>
	);
}
