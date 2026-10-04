import { type ReactNode, useSyncExternalStore } from "react";
import Animated, {
	Easing,
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { CARD_ROUTES, isCoveredByCard } from "./depth-screen-model";

/** Android's slide_from_bottom: config_mediumAnimTime with the default
 * accelerate-decelerate curve, so the page behind moves in step with it. */
const TIMING = { duration: 400, easing: Easing.inOut(Easing.sin) };

/** Cards going down right now. The tab bar waits for them: shown at once,
 * it would sit over the card still sliding under it. */
let closingCards = 0;
const listeners = new Set<() => void>();
function setClosingCards(next: number) {
	closingCards = next;
	for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
/** A title's card is still on its way down. */
export function useCardClosing() {
	return useSyncExternalStore(subscribe, () => closingCards > 0);
}

type StackNavigation = {
	getState: () => { routes: { key: string; name: string }[] };
	addListener: {
		(
			type: "transitionStart",
			listener: (event: { data: { closing: boolean } }) => void,
		): () => void;
		(type: "beforeRemove", listener: () => void): () => void;
	};
};

/**
 * Wraps every screen of a stack. When a title's page rises over it as a card
 * (Fable), this one sinks back: a little smaller, rounded and dimmed, and
 * comes forward again as the card goes down.
 */
export function DepthScreen({
	route,
	navigation,
	children,
}: {
	route: { key: string; name: string };
	navigation: unknown;
	children: ReactNode;
}) {
	const depth = useSharedValue(0);
	// A card being closed says so before the route changes, so the tab bar
	// never shows for a frame over it.
	useMountEffect(() => {
		if (!CARD_ROUTES.has(route.name)) return;
		return (navigation as StackNavigation).addListener("beforeRemove", () => {
			setClosingCards(closingCards + 1);
			setTimeout(() => setClosingCards(closingCards - 1), TIMING.duration);
		});
	});
	useMountEffect(() => {
		const stack = navigation as StackNavigation;
		return stack.addListener("transitionStart", ({ data }) => {
			if (!data.closing) {
				depth.set(withTiming(0, TIMING));
				return;
			}
			if (isCoveredByCard(stack.getState().routes, route.key))
				depth.set(withTiming(1, TIMING));
		});
	});
	const sink = useAnimatedStyle(() => {
		const d = depth.get();
		return {
			borderRadius: interpolate(d, [0, 1], [0, 16]),
			transform: [
				{ translateY: interpolate(d, [0, 1], [0, 12]) },
				{ scale: interpolate(d, [0, 1], [1, 0.94]) },
			],
		};
	});
	const dim = useAnimatedStyle(() => ({
		opacity: interpolate(depth.get(), [0, 1], [0, 0.4]),
	}));

	return (
		<Animated.View
			style={[{ flex: 1, overflow: "hidden", borderCurve: "continuous" }, sink]}
		>
			{children}
			<Animated.View
				pointerEvents="none"
				style={[
					{ position: "absolute", inset: 0, backgroundColor: "#000000" },
					dim,
				]}
			/>
		</Animated.View>
	);
}
