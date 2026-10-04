import { Image } from "expo-image";
import { View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { useMountEffect } from "@/hooks/use-mount-effect";
import {
	coverWidth,
	marqueeDistance,
	type ShelfCover,
} from "@/lib/welcome-covers";
import { space, usePalette } from "@/theme";

const GAP = space.sm;
/** Points per second: a slow drift, felt more than watched. */
const SPEED = 7;

/**
 * fable.co's moving shelf (Storytel's cover wall): rows of book and
 * audiobook covers drifting in alternating directions, edge to edge, cut
 * clean by their frame — never faded.
 */
export function CoverShelf({
	rows,
	coverHeight,
}: {
	rows: ShelfCover[][];
	coverHeight: number;
}) {
	return (
		<View
			style={{ overflow: "hidden" }}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<View style={{ gap: GAP }}>
				{rows.map((row, index) => (
					<MarqueeRow
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed rows
						key={index}
						covers={row}
						height={coverHeight}
						reverse={index % 2 === 1}
						// Rows start at different points so no column lines up.
						offset={index * coverHeight * 0.3}
					/>
				))}
			</View>
		</View>
	);
}

function MarqueeRow({
	covers,
	height,
	reverse,
	offset,
}: {
	covers: ShelfCover[];
	height: number;
	reverse: boolean;
	offset: number;
}) {
	const palette = usePalette();
	const reduced = useReducedMotion();
	const distance = marqueeDistance(covers, height, GAP);
	const progress = useSharedValue(0);
	useMountEffect(() => {
		if (reduced) return;
		progress.value = withRepeat(
			withTiming(1, {
				duration: (distance / SPEED) * 1000,
				easing: Easing.linear,
			}),
			-1,
		);
	});
	const style = useAnimatedStyle(() => {
		const travel = progress.value * distance;
		return {
			transform: [
				{ translateX: -offset - (reverse ? distance - travel : travel) },
			],
		};
	});
	return (
		<Animated.View style={[{ flexDirection: "row", gap: GAP }, style]}>
			{[...covers, ...covers, ...covers].map((cover, index) => (
				<Image
					// biome-ignore lint/suspicious/noArrayIndexKey: the row repeats on purpose
					key={`${cover.uri}:${index}`}
					source={cover.uri}
					cachePolicy="disk"
					transition={300}
					contentFit="cover"
					style={{
						width: coverWidth(cover, height),
						height,
						borderRadius: palette.coverRadius,
						// Offline, the shelf is still a shelf: plain spines, no holes.
						backgroundColor: palette.surface,
					}}
				/>
			))}
		</Animated.View>
	);
}
