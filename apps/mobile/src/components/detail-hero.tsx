import { Image } from "expo-image";
import { router } from "expo-router";
import type { ReactNode } from "react";
import {
	Platform,
	useColorScheme,
	useWindowDimensions,
	View,
} from "react-native";
import Animated, {
	Extrapolation,
	interpolate,
	type SharedValue,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coverUrl, HERO_BACKDROP_WIDTH, heroCoverWidth } from "@/lib/covers";
import { useConnection } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";
import { Cover } from "./cover";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";

/**
 * Book/audio hero (Fable's layout): the cover floats centered on its own
 * blurred colours (tap it to see it up close), then a left-aligned title
 * block and the stacked
 * actions. The wash stays behind the cover and is gone by the title.
 */
export function DetailHero({
	cover,
	color,
	shape,
	title,
	subtitle,
	people,
	actions,
	uuid,
	onTitleOffset,
	scrollY,
}: {
	cover: string | null;
	color: string | null;
	shape: "book" | "audio";
	title: string;
	subtitle?: string | null;
	people?: ReactNode;
	actions: ReactNode;
	uuid: string;
	/** Where the title block starts in the page's scroll content. */
	onTitleOffset?: (y: number) => void;
	/** The page's scroll offset, for the parallax and the pull-down stretch. */
	scrollY?: SharedValue<number>;
}) {
	const palette = usePalette();
	const dark = useColorScheme() === "dark";
	const insets = useSafeAreaInsets();
	const { serverUrl } = useConnection();
	const { width: screen } = useWindowDimensions();
	const gutter = screen >= 1024 ? 32 : screen >= 768 ? 24 : 16;
	const coverWidth = heroCoverWidth(screen, shape);
	// Blur the rendered backdrop on Android 12+, bypassing Expo Image
	// bitmap blur limits. Older Android versions retain the image fallback.
	const nativeBlur =
		Platform.OS === "android" && Number(Platform.Version) >= 31;
	const backdrop = coverUrl(serverUrl, cover, HERO_BACKDROP_WIDTH);
	const bg = palette.background;
	const top = insets.top + 64;
	const coverHeight = shape === "audio" ? coverWidth : coverWidth * 1.5;
	const washHeight = top + coverHeight + space.xl;
	const still = useSharedValue(0);
	const scroll = scrollY ?? still;
	// Pulled down (iOS bounce), the wash stays pinned and stretches to fill
	// the gap; scrolled up, it drifts slower than the page.
	const washStyle = useAnimatedStyle(() => {
		const y = scroll.get();
		if (y < 0)
			return {
				transform: [{ translateY: y }, { scale: 1 - y / washHeight }],
			};
		return { transform: [{ translateY: y * 0.4 }, { scale: 1 }] };
	});
	// The cover shrinks toward its top edge and fades as it leaves, so it never
	// drifts onto the title below it.
	const coverStyle = useAnimatedStyle(() => {
		const y = scroll.get();
		return {
			opacity: interpolate(
				y,
				[0, coverHeight * 0.85],
				[1, 0],
				Extrapolation.CLAMP,
			),
			transform: [
				{
					scale: interpolate(
						y,
						[-160, 0, coverHeight],
						[1.06, 1, 0.88],
						Extrapolation.CLAMP,
					),
				},
			],
		};
	});

	return (
		<View>
			<Animated.View
				pointerEvents="none"
				style={[
					{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						height: washHeight,
						overflow: "hidden",
						transformOrigin: "top",
					},
					washStyle,
				]}
			>
				{backdrop ? (
					<View
						style={{
							position: "absolute",
							inset: -60,
							opacity: dark ? 0.35 : 0.28,
							// Dimmed at the source so the colours deepen instead of
							// turning grey under a black layer.
							filter: nativeBlur
								? [{ blur: 60 }, { brightness: 0.7 }]
								: [{ brightness: 0.7 }],
						}}
					>
						<Image
							source={{ uri: backdrop }}
							blurRadius={nativeBlur ? 0 : 60}
							contentFit="cover"
							style={{ position: "absolute", inset: 0 }}
						/>
					</View>
				) : color ? (
					<View
						style={{
							position: "absolute",
							inset: 0,
							backgroundColor: color,
							opacity: dark ? 0.16 : 0.1,
						}}
					/>
				) : null}
				{/* Eased stops so the wash thins out along the cover and ends
				    in the page's own background, never a band. */}
				<View
					style={{
						position: "absolute",
						inset: 0,
						experimental_backgroundImage: `linear-gradient(to bottom, ${bg}00 0%, ${bg}26 35%, ${bg}73 60%, ${bg}c2 80%, ${bg}f0 93%, ${bg} 100%)`,
					}}
				/>
			</Animated.View>

			<View
				style={{
					paddingTop: top,
					paddingHorizontal: gutter,
					maxWidth: 760,
					width: "100%",
					alignSelf: "center",
					gap: space.xl,
				}}
			>
				<Animated.View
					style={[
						{
							alignSelf: "center",
							borderRadius: palette.coverRadius,
							borderCurve: "continuous",
							transformOrigin: "top",
							boxShadow: dark
								? "0 20px 40px -12px rgba(0, 0, 0, 0.75)"
								: "0 20px 40px -16px rgba(0, 0, 0, 0.5)",
						},
						coverStyle,
					]}
				>
					<PressableScale
						disabled={!cover}
						onPress={() =>
							cover &&
							router.push({ pathname: "/cover", params: { cover, shape } })
						}
						accessibilityRole="imagebutton"
						accessibilityLabel={title}
					>
						<Cover
							cover={cover}
							color={color}
							width={coverWidth}
							shape={shape}
							recyclingKey={uuid}
						/>
					</PressableScale>
				</Animated.View>

				<View
					style={{ gap: space.md, marginTop: space.sm }}
					// The hero opens the page, so this y is the scroll offset.
					onLayout={(event) => onTitleOffset?.(event.nativeEvent.layout.y)}
				>
					<View style={{ gap: space.xs }}>
						<Text
							variant="largeTitle"
							selectable
							accessibilityRole="header"
							style={{ fontWeight: "700", letterSpacing: -0.5 }}
						>
							{title}
						</Text>
						{subtitle ? (
							<Text
								variant="title"
								tone="secondary"
								selectable
								style={{ fontWeight: "500" }}
							>
								{subtitle}
							</Text>
						) : null}
					</View>
					{people}
				</View>
				{actions}
			</View>
		</View>
	);
}
