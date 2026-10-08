import { type ReactNode, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { pinnedRowTop } from "@/lib/app-bar-scroll";
import { sizes, usePalette } from "@/theme";

/**
 * A row (the format tabs) that scrolls with the page and then sticks under
 * the bar, so switching never needs a trip back to the top. The page keeps
 * a <PinnedSlot> where the row belongs; the row itself floats over the list
 * in <PinnedRow>, moved by transforms on the UI thread.
 */
export function usePinnedRow() {
	// -1 until the slot is laid out: the row stays hidden, not pinned.
	const anchorY = useSharedValue(-1);
	const [height, setHeight] = useState<number>(sizes.control + 1);
	return { anchorY, height, setHeight };
}

type Pinned = ReturnType<typeof usePinnedRow>;

/** Holds the row's place in the scroll content. Its y must be measured in
 * the content's own coordinates, so mount it directly in the content (or in
 * a header that starts at the content's top). */
export function PinnedSlot({
	pinned,
	marginTop,
}: {
	pinned: Pinned;
	marginTop?: number;
}) {
	return (
		<View
			style={{ height: pinned.height, marginTop }}
			onLayout={(event) => pinned.anchorY.set(event.nativeEvent.layout.y)}
		/>
	);
}

export function PinnedRow({
	pinned,
	scrollY,
	pinTop,
	children,
}: {
	pinned: Pinned;
	scrollY: SharedValue<number>;
	/** Screen y of the bar's bottom edge. */
	pinTop: SharedValue<number>;
	children: ReactNode;
}) {
	const palette = usePalette();
	const { anchorY, setHeight } = pinned;
	const style = useAnimatedStyle(() => {
		const anchor = anchorY.get();
		return {
			opacity: anchor < 0 ? 0 : 1,
			transform: [
				{ translateY: pinnedRowTop(anchor, scrollY.get(), pinTop.get()) },
			],
		};
	});
	const measure = (event: LayoutChangeEvent) => {
		const next = Math.round(event.nativeEvent.layout.height);
		setHeight((current) => (current === next ? current : next));
	};
	return (
		<Animated.View
			onLayout={measure}
			style={[
				{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					backgroundColor: palette.background,
				},
				style,
			]}
		>
			{children}
		</Animated.View>
	);
}
