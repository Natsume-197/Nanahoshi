import { View } from "react-native";
import { useAvailableOffline } from "@/downloads/provider";
import { t } from "@/lib/i18n";
import { usePalette } from "@/theme";
import { Icon, icons } from "./icon";

/** Offline, the cover of a title on the phone gets a tick in its corner.
 * Drawn inside the cover's frame; online it draws nothing. */
export function OfflineTick({ uuid }: { uuid: string }) {
	const palette = usePalette();
	const available = useAvailableOffline(uuid);
	if (!available) return null;
	return (
		<View
			pointerEvents="none"
			accessibilityLabel={t("mobile.offline.on_device")}
			style={{
				position: "absolute",
				top: 6,
				right: 6,
				width: 24,
				height: 24,
				borderRadius: 12,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: palette.background,
			}}
		>
			<Icon name={icons.downloaded} size={16} color={palette.text} />
		</View>
	);
}
