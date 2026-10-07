import type { Ref } from "react";
import type { View } from "react-native";
import { type PressableProps, Pressable as RNPressable } from "react-native";

// Android's tap timeout: a finger that starts scrolling within it never
// highlights or ripples the row it landed on. A quick tap still flashes.
const PRESS_DELAY = 100;

/** Use instead of react-native's Pressable. */
export function Pressable(props: PressableProps & { ref?: Ref<View> }) {
	return <RNPressable unstable_pressDelay={PRESS_DELAY} {...props} />;
}
