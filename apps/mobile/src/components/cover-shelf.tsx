import { Image } from "expo-image";
import { View } from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	useAnimatedReaction,
	useAnimatedStyle,
	useDerivedValue,
	useReducedMotion,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import {
	coverWidth,
	marqueeDistance,
	type ShelfCover,
} from "@/lib/welcome-covers";
import { space, usePalette } from "@/theme";

const GAP = space.sm;
/** Points per second: a slow drift, felt more than watched. */
const SPEED = 7;
/** Loops per run: progress only climbs, its fraction is the position. */
const LOOPS = 10_000;

/**
 * fable.co's moving shelf (Storytel's cover wall): rows of book and
 * audiobook covers drifting in alternating directions, edge to edge, cut
 * clean by their frame — never faded.
 */
export function CoverShelf({
	rows,
	coverHeight,
	active = true,
}: {
	rows: ShelfCover[][];
	coverHeight: number;
	/** Off screen (another slide, a screen on top): the drift pauses. */
	active?: boolean;
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
						active={active}
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
	active,
}: {
	covers: ShelfCover[];
	height: number;
	reverse: boolean;
	offset: number;
	active: boolean;
}) {
	const palette = usePalette();
	const reduced = useReducedMotion();
	const distance = marqueeDistance(covers, height, GAP);
	const loop = (distance / SPEED) * 1000;
	const progress = useSharedValue(0);
	const running = useDerivedValue(() => active && !reduced);
	// It kept moving under the sign-in screens and on the other slides; now
	// it stops there and picks up where it was.
	useAnimatedReaction(
		() => running.get(),
		(on) => {
			if (!on) {
				cancelAnimation(progress);
				return;
			}
			progress.set(
				withTiming(progress.get() + LOOPS, {
					duration: loop * LOOPS,
					easing: Easing.linear,
				}),
			);
		},
	);
	const style = useAnimatedStyle(() => {
		const travel = (progress.get() % 1) * distance;
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
