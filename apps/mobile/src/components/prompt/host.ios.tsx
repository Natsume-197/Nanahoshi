import { useSyncExternalStore } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { radius, space, usePalette } from "@/theme";
import { Icon, icons } from "../icon";
import { Text } from "../text";
import { notices } from "./index";

/** iOS asks through the system action sheet, so there is nothing to host. */
export function ChoiceHost() {
	return null;
}

/** A small pill over the tab bar, like the system's own HUDs; never modal. */
export function NoticeHost() {
	const palette = usePalette();
	const notice = useSyncExternalStore(notices.subscribe, notices.get);
	return (
		<View
			pointerEvents="none"
			style={{
				position: "absolute",
				left: space.lg,
				right: space.lg,
				bottom: space.sm,
				alignItems: "center",
			}}
		>
			{notice ? (
				<Animated.View
					key={notice.id}
					entering={FadeInDown.duration(220)}
					exiting={FadeOutDown.duration(160)}
					accessibilityLiveRegion="polite"
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: space.sm,
						paddingHorizontal: space.lg,
						paddingVertical: space.md,
						borderRadius: radius.pill,
						borderCurve: "continuous",
						backgroundColor: palette.card,
						boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
					}}
				>
					<Icon name={icons.warning} size={16} color={palette.danger} />
					<Text variant="subhead" style={{ flexShrink: 1 }}>
						{notice.message}
					</Text>
				</Animated.View>
			) : null}
		</View>
	);
}
