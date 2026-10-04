import { useState } from "react";
import {
	RefreshControl as NativeRefreshControl,
	type RefreshControlProps,
} from "react-native";
import { haptics } from "@/lib/haptics";
import { usePalette } from "@/theme";

/**
 * Pull to refresh in the app's colors, with a haptic when it triggers. The
 * spinner shows only while a pull's own refresh runs: background refetches
 * (opening a page with cached data, polling, invalidation) stay silent,
 * where a query's isRefetching flashed the spinner on every visit.
 * ScrollViews clone this element, so every other prop is passed through.
 */
export function RefreshControl({
	onRefresh,
	...props
}: Omit<RefreshControlProps, "refreshing" | "onRefresh"> & {
	onRefresh: () => unknown;
}) {
	const palette = usePalette();
	const [pulling, setPulling] = useState(false);
	return (
		<NativeRefreshControl
			tintColor={palette.textSecondary}
			colors={[palette.text]}
			progressBackgroundColor={palette.surface}
			{...props}
			refreshing={pulling}
			onRefresh={async () => {
				haptics.grab();
				setPulling(true);
				try {
					await onRefresh();
				} finally {
					setPulling(false);
				}
			}}
		/>
	);
}
