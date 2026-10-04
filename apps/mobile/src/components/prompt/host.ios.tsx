import { useSyncExternalStore } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { EASE_OUT, radius, shadows, space, usePalette } from "@/theme";
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
			pointerEvents="box-none"
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
					entering={FadeInDown.duration(220).easing(EASE_OUT)}
					exiting={FadeOutDown.duration(160).easing(EASE_OUT)}
					accessibilityLiveRegion="polite"
					pointerEvents={notice.action ? "auto" : "none"}
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: space.sm,
						paddingHorizontal: space.lg,
						paddingVertical: space.md,
						borderRadius: radius.pill,
						borderCurve: "continuous",
						backgroundColor: palette.card,
						boxShadow: shadows.toast,
					}}
				>
					{notice.action ? null : notice.info ? (
						<Icon name={icons.checkCircle} size={16} color={palette.text} />
					) : (
						<Icon name={icons.warning} size={16} color={palette.danger} />
					)}
					<Text variant="subhead" style={{ flexShrink: 1 }}>
						{notice.message}
					</Text>
					{notice.action ? (
						<Pressable
							accessibilityRole="button"
							hitSlop={12}
							onPress={() => notices.act(notice.id)}
						>
							<Text
								variant="subhead"
								style={{ color: palette.primary, fontWeight: "600" }}
							>
								{notice.action.label}
							</Text>
						</Pressable>
					) : null}
				</Animated.View>
			) : null}
		</View>
	);
}
