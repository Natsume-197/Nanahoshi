import { type ReactNode, type Ref, useState } from "react";
import type { PressableProps, StyleProp, View, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { Pressable } from "@/components/pressable";
import { motion } from "@/theme";

/**
 * Press feedback for cards and covers (expo-animation's press recipe): a
 * Reanimated CSS transition to scale 0.97 on press-in, 120 ms, strong
 * ease-out. No shared value — two state flips per press, never per frame.
 * `style` shapes the scaled box; the Pressable itself stays unstyled.
 * Cards in scrolling lists pass `scaleOnPress={false}`: a finger dragging
 * the list would otherwise squeeze every card it lands on.
 */
export function PressableScale({
	ref,
	children,
	style,
	onPressIn,
	onPressOut,
	scaleOnPress = true,
	...props
}: Omit<PressableProps, "style" | "children"> & {
	ref?: Ref<View>;
	scaleOnPress?: boolean;
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	const [pressed, setPressed] = useState(false);
	return (
		<Pressable
			{...props}
			ref={ref}
			pressRetentionOffset={16}
			onPressIn={(event) => {
				setPressed(true);
				onPressIn?.(event);
			}}
			onPressOut={(event) => {
				setPressed(false);
				onPressOut?.(event);
			}}
		>
			<Animated.View
				style={[
					style,
					{
						transform: [{ scale: pressed && scaleOnPress ? 0.97 : 1 }],
						transitionProperty: "transform",
						transitionDuration: motion.press,
						transitionTimingFunction: motion.easeOut,
					},
				]}
			>
				{children}
			</Animated.View>
		</Pressable>
	);
}
