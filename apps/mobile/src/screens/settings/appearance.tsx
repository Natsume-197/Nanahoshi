import { ScrollView } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { setAppearance, useAppearancePreference } from "@/lib/appearance";
import { t } from "@/lib/i18n";
import type { AppearancePreference } from "@/lib/preferences";
import { useMiniPlayerInset } from "@/player/mini-player";
import { space } from "@/theme";

const OPTIONS: {
	value: AppearancePreference;
	label: () => string;
	subtitle?: () => string;
}[] = [
	{
		value: "system",
		label: () => t("settings.appearance.theme_system"),
		subtitle: () => t("settings.appearance.theme_system_desc"),
	},
	{ value: "light", label: () => t("settings.appearance.theme_light") },
	{ value: "dark", label: () => t("settings.appearance.theme_dark") },
];

/** Light, dark or the device's own: kept on this phone, applied at once. */
export function AppearanceSettingsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const current = useAppearancePreference();
	return (
		<ScrollView
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				padding: space.lg,
				paddingBottom: space.lg + miniPlayerInset,
			}}
		>
			<GroupedList title={t("settings.appearance.color_scheme")}>
				{OPTIONS.map((option, index) => (
					<GroupedRow
						key={option.value}
						first={index === 0}
						label={option.label()}
						subtitle={option.subtitle?.()}
						checked={current === option.value}
						onPress={() => void setAppearance(option.value)}
					/>
				))}
			</GroupedList>
		</ScrollView>
	);
}
