import { type Href, router } from "expo-router";
import type { PressableProps } from "react-native";
import { Pressable } from "@/components/pressable";

/**
 * A Pressable that navigates. Use this instead of `<Link asChild><Pressable>`:
 * Link's Slot merges props but drops a function `style`, so a row styled
 * with `({ pressed }) => …` lost its flexDirection and collapsed into a
 * column on Android.
 */
export function PressableLink({
	href,
	onPress,
	...props
}: Omit<PressableProps, "href"> & { href: Href }) {
	return (
		<Pressable
			{...props}
			onPress={(event) => {
				onPress?.(event);
				router.push(href);
			}}
		/>
	);
}
