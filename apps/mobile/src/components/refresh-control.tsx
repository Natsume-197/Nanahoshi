import {
	RefreshControl as NativeRefreshControl,
	type RefreshControlProps,
} from "react-native";
import { haptics } from "@/lib/haptics";
import { usePalette } from "@/theme";

/** Pull to refresh in the app's colors, with a haptic when it triggers.
 * ScrollViews clone this element, so every prop is passed through. */
export function RefreshControl({ onRefresh, ...props }: RefreshControlProps) {
	const palette = usePalette();
	return (
		<NativeRefreshControl
			tintColor={palette.textSecondary}
			colors={[palette.text]}
			progressBackgroundColor={palette.surface}
			{...props}
			onRefresh={
				onRefresh &&
				(() => {
					haptics.grab();
					onRefresh();
				})
			}
		/>
	);
}
