import type { ReactElement } from "react";
import type { GestureResponderEvent, StyleProp, ViewStyle } from "react-native";
import type { BookTarget } from "./model";

export type BookMenuTargetProps = {
	target: BookTarget;
	/** Shapes the view the menu anchors to (and iOS lifts). */
	style?: StyleProp<ViewStyle>;
	/** Receives the long-press handler to wire into the tile's Pressable;
	 * undefined where the platform recognizes the gesture itself (iOS). */
	children: (
		onLongPress: ((event: GestureResponderEvent) => void) | undefined,
	) => ReactElement;
};
