import { Image } from "expo-image";
import { router } from "expo-router";
import type { ReactNode } from "react";
import {
	Platform,
	useColorScheme,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coverUrl } from "@/lib/covers";
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
}: {
	cover: string | null;
	color: string | null;
	shape: "book" | "audio";
	title: string;
	subtitle?: string | null;
	people?: ReactNode;
	actions: ReactNode;
	uuid: string;
}) {
	const palette = usePalette();
	const dark = useColorScheme() === "dark";
	const insets = useSafeAreaInsets();
	const { serverUrl } = useConnection();
	const { width: screen } = useWindowDimensions();
	const gutter = screen >= 1024 ? 32 : screen >= 768 ? 24 : 16;
	const coverWidth =
		shape === "audio"
			? Math.min(screen >= 640 ? 280 : 240, screen - 96)
			: Math.min(screen >= 640 ? 240 : 200, screen - 150);
	// Blur the rendered backdrop on Android 12+, bypassing Expo Image
	// bitmap blur limits. Older Android versions retain the image fallback.
	const nativeBlur =
		Platform.OS === "android" && Number(Platform.Version) >= 31;
	const backdrop = coverUrl(serverUrl, cover, 200);
	const bg = palette.background;
	const top = insets.top + 64;
	const coverHeight = shape === "audio" ? coverWidth : coverWidth * 1.5;
	const washHeight = top + coverHeight + space.xl;

	return (
		<View>
			<View
				pointerEvents="none"
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					height: washHeight,
					overflow: "hidden",
				}}
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
			</View>

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
				<View
					style={{
						alignSelf: "center",
						borderRadius: palette.coverRadius,
						borderCurve: "continuous",
						boxShadow: dark
							? "0 20px 40px -12px rgba(0, 0, 0, 0.75)"
							: "0 20px 40px -16px rgba(0, 0, 0, 0.5)",
					}}
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
				</View>

				<View style={{ gap: space.md, marginTop: space.sm }}>
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
