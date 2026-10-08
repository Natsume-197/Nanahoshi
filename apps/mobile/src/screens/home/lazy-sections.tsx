import {
	Children,
	createContext,
	type ReactNode,
	use,
	useRef,
	useState,
} from "react";
import { useWindowDimensions } from "react-native";
import {
	type SharedValue,
	useAnimatedReaction,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { shouldRevealMore } from "./lazy-model";

/** Above the fold on a phone: continue, recently added, the first picks. */
const INITIAL = 3;
/** More than Home's longest list of sections (eleven). */
const MAX = 12;
// A section that draws nothing never changes the content height, so each
// reveal checks again shortly after instead of waiting for one.
const RECHECK_MS = 80;

const LazyContext = createContext(Number.POSITIVE_INFINITY);

/**
 * Home's sections mount as the page nears them, then stay mounted: each one
 * runs its own queries and a rail of covers, and mounting all eleven at once
 * fired about 18 requests and 250 cover loads before the first scroll.
 * The scroll view passes its offset and `onContentSizeChange`.
 */
export function useLazySections(scrollY: SharedValue<number>) {
	const { height } = useWindowDimensions();
	const [revealed, setRevealed] = useState(INITIAL);
	const contentHeight = useSharedValue(Number.POSITIVE_INFINITY);
	const shown = useRef(INITIAL);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const check = () => {
		if (shown.current >= MAX) return;
		if (!shouldRevealMore(scrollY.get(), height, contentHeight.get())) return;
		shown.current += 1;
		setRevealed(shown.current);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(check, RECHECK_MS);
	};
	// Scrolling toward the end of what is drawn.
	useAnimatedReaction(
		() => shouldRevealMore(scrollY.get(), height, contentHeight.get()),
		(near, wasNear) => {
			if (near && !wasNear) scheduleOnRN(check);
		},
	);

	return {
		revealed,
		onContentSizeChange: (_width: number, contentH: number) => {
			contentHeight.set(contentH);
			check();
		},
	};
}

export function LazySectionsProvider({
	revealed,
	children,
}: {
	revealed: number;
	children: ReactNode;
}) {
	return <LazyContext value={revealed}>{children}</LazyContext>;
}

/** Renders the first sections the page has reached. */
export function LazySections({ children }: { children: ReactNode }) {
	const revealed = use(LazyContext);
	return Children.toArray(children).slice(0, revealed);
}
