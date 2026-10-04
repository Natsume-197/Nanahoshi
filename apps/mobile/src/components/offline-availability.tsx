import type { ReactNode } from "react";
import { View } from "react-native";
import { useAvailableOffline } from "@/downloads/provider";
import { t } from "@/lib/i18n";
import { usePalette } from "@/theme";
import { Icon, icons } from "./icon";

/** Offline, the covers of titles on the phone get a tick. Online it changes
 * nothing. */
export function OfflineAvailability({
	uuid,
	children,
}: {
	uuid: string;
	children: ReactNode;
}) {
	const palette = usePalette();
	const available = useAvailableOffline(uuid);
	if (!available) return children;
	return (
		<View accessibilityLabel={t("mobile.offline.on_device")}>
			{children}
			<View
				pointerEvents="none"
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
		</View>
	);
}
