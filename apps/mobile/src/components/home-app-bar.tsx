import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import Animated, {
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName, icons } from "@/components/icon";
import { Pressable } from "@/components/pressable";
import { Text } from "@/components/text";
import { nextAppBarOffset, settleAppBarOffset } from "@/lib/app-bar-scroll";
import { t } from "@/lib/i18n";
import { useApi } from "@/providers/app-provider";
import { EASE_OUT, usePalette } from "@/theme";

/** A compact 56dp top bar (64 on tablets for the search field). */
export function useAppBarHeight() {
	const { width } = useWindowDimensions();
	return width >= 768 ? 64 : 56;
}

/**
 * Scroll state for an "enter always" app bar over a scroll view: attach
 * `onScroll` to an Animated.ScrollView (scrollEventThrottle 16) and hand the
 * result to <HomeAppBar>.
 */
export function useAppBarScroll() {
	const height = useAppBarHeight();
	const offset = useSharedValue(0);
	const lastY = useSharedValue(0);
	const onScroll = useAnimatedScrollHandler({
		onScroll: (event) => {
			const y = event.contentOffset.y;
			offset.set(nextAppBarOffset(offset.get(), lastY.get(), y, height));
			lastY.set(y);
		},
		onEndDrag: (event) => {
			const target = settleAppBarOffset(
				offset.get(),
				event.contentOffset.y,
				height,
			);
			if (target !== offset.get())
				offset.set(withTiming(target, { duration: 150, easing: EASE_OUT }));
		},
	});
	return { onScroll, offset, height };
}

type AppBarScroll = ReturnType<typeof useAppBarScroll>;

/**
 * Home's top bar on Android: the page's title leading, downloads, friends
 * and notifications trailing. It slides away while you read down and
 * returns the moment you scroll up. It keeps the page's own color throughout.
 */
export function HomeAppBar({ scroll }: { scroll: AppBarScroll }) {
	const palette = usePalette();
	const insets = useSafeAreaInsets();
	const wide = useWindowDimensions().width >= 768;
	const { orpc } = useApi();
	const unread = useQuery({
		...orpc.notifications.unreadCount.queryOptions(),
		refetchInterval: 60_000,
	});

	// Worklets copy what they capture: take the shared value, not `scroll`
	// (it also holds the scroll handler).
	const { offset } = scroll;
	const surface = { backgroundColor: palette.background };
	const slide = useAnimatedStyle(() => ({
		transform: [{ translateY: offset.get() }],
	}));

	return (
		<>
			<Animated.View
				style={[
					{
						position: "absolute",
						top: insets.top,
						left: 0,
						right: 0,
						height: scroll.height,
						paddingLeft: 16,
						paddingRight: 4,
						flexDirection: "row",
						alignItems: "center",
						gap: wide ? 16 : 0,
					},
					surface,
					slide,
				]}
			>
				{/* Where PageHeader puts Collections' and Library's titles, so
				    switching tabs leaves the heading in place. */}
				<Text
					variant="pageTitle"
					accessibilityRole="header"
					numberOfLines={1}
					style={{ flexShrink: 1, alignSelf: "flex-start", marginTop: 16 }}
				>
					{t("nav.home")}
				</Text>
				{wide ? <SearchField /> : null}
				<View style={{ flexDirection: "row", marginLeft: "auto" }}>
					<Action
						label={t("mobile.downloads.title")}
						icon={icons.download}
						onPress={() => router.push("/downloads")}
					/>
					<Action
						label={t("aria.friends_activity")}
						icon={{ ios: "person.2", android: "group" }}
						onPress={() => router.push("/friends")}
					/>
					<Action
						label={t("notifications.title")}
						icon={{ ios: "bell", android: "notifications" }}
						badge={(unread.data?.count ?? 0) > 0}
						onPress={() => router.push("/notifications")}
					/>
				</View>
			</Animated.View>
			{/* Covers the status bar so content scrolls under it, not through it. */}
			<View
				pointerEvents="none"
				style={[
					{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						height: insets.top,
					},
					surface,
				]}
			/>
		</>
	);
}

/** A standard 48dp icon button with the platform's round ripple. */
function Action({
	label,
	icon,
	badge,
	onPress,
}: {
	label: string;
	icon: IconName;
	badge?: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			android_ripple={{ color: palette.ripple, borderless: true, radius: 20 }}
			style={{
				width: 48,
				height: 48,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Icon name={icon} size={22} color={palette.text} />
			{badge ? (
				// Material's small badge: a 6dp dot on the icon's top-end corner.
				<View
					pointerEvents="none"
					style={{
						position: "absolute",
						top: 12,
						right: 12,
						width: 6,
						height: 6,
						borderRadius: 3,
						backgroundColor: palette.danger,
					}}
				/>
			) : null}
		</Pressable>
	);
}

/** Tablets: search sits in the bar, as on the web. */
function SearchField() {
	const palette = usePalette();
	return (
		<Pressable
			accessibilityRole="search"
			accessibilityLabel={t("common.search")}
			onPress={() => router.navigate("/(tabs)/(search)")}
			style={{
				flex: 2,
				maxWidth: 544,
				minWidth: 0,
				height: 48,
				borderRadius: 24,
				backgroundColor: palette.input,
				paddingHorizontal: 16,
				flexDirection: "row",
				alignItems: "center",
				gap: 12,
			}}
		>
			<Icon name={icons.search} color={palette.textSecondary} size={22} />
			<Text
				numberOfLines={1}
				style={{ flex: 1, fontSize: 16, color: palette.textSecondary }}
			>
				{t("search.placeholder")}
			</Text>
		</Pressable>
	);
}
