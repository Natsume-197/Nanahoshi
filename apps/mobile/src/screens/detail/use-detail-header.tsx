import { Stack } from "expo-router";
import { StyleSheet } from "react-native";
import Animated, {
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IS_ANDROID } from "@/lib/platform";
import { fonts, usePalette } from "@/theme";
import { headerSolidProgress } from "./detail-model";

/** Android's top app bar height under the status bar. */
const APP_BAR_HEIGHT = 56;

/**
 * The detail bar floats transparent over the cover, then fades solid and
 * slides the title in as the hero's title scrolls under it (Play Store). iOS
 * keeps its own scroll-edge treatment. Scroll is tracked on the UI thread,
 * and also drives the hero's parallax.
 */
export function useDetailHeader(title: string) {
	const palette = usePalette();
	const insets = useSafeAreaInsets();
	const scrollY = useSharedValue(0);
	const titleOffset = useSharedValue<number | null>(null);
	const barBottom = insets.top + APP_BAR_HEIGHT;

	const onScroll = useAnimatedScrollHandler((event) => {
		scrollY.set(event.contentOffset.y);
	});
	const backgroundStyle = useAnimatedStyle(() => ({
		opacity: headerSolidProgress({
			scrollY: scrollY.get(),
			titleOffset: titleOffset.get(),
			barBottom,
		}),
	}));
	const titleStyle = useAnimatedStyle(() => {
		const progress = headerSolidProgress({
			scrollY: scrollY.get(),
			titleOffset: titleOffset.get(),
			barBottom,
		});
		return {
			opacity: progress,
			transform: [{ translateY: (1 - progress) * 8 }],
		};
	});

	const header = IS_ANDROID ? (
		<Stack.Screen
			options={{
				title: "",
				headerStyle: { backgroundColor: "transparent" },
				headerBackground: () => (
					<Animated.View
						style={[
							StyleSheet.absoluteFill,
							{ backgroundColor: palette.background },
							backgroundStyle,
						]}
					/>
				),
				headerTitle: () => (
					<Animated.Text
						numberOfLines={1}
						style={[
							{
								color: palette.text,
								fontFamily: fonts["600"],
								fontSize: 20,
							},
							titleStyle,
						]}
					>
						{title}
					</Animated.Text>
				),
			}}
		/>
	) : null;

	return {
		header,
		scrollY,
		scrollProps: { onScroll, scrollEventThrottle: 16 },
		onTitleOffset: (y: number) => {
			titleOffset.set(y);
		},
	};
}
