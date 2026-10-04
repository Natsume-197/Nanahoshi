import { ScrollView } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { getLanguagePreference, setLanguagePreference, t } from "@/lib/i18n";
import {
	LANGUAGE_NAMES,
	LANGUAGES,
	type LanguagePreference,
} from "@/lib/preferences";
import { setResumeRoute } from "@/lib/resume-route";
import { useMiniPlayerInset } from "@/player/mini-player";
import { space } from "@/theme";

/** A new language remounts the app's navigation (every screen reads its
 * strings while rendering), so we ask to come back here afterwards. */
function choose(preference: LanguagePreference) {
	if (preference === getLanguagePreference()) return;
	setResumeRoute(["/(tabs)/(me)", "/settings", "/settings/language"]);
	void setLanguagePreference(preference);
}

export function LanguageSettingsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const current = getLanguagePreference();
	const options: { value: LanguagePreference; label: string }[] = [
		{ value: "system", label: t("mobile.settings.language_system") },
		...LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] })),
	];
	return (
		<ScrollView
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				padding: space.lg,
				paddingBottom: space.lg + miniPlayerInset,
			}}
		>
			<GroupedList footer={t("settings.language.desc")}>
				{options.map((option, index) => (
					<GroupedRow
						key={option.value}
						first={index === 0}
						label={option.label}
						checked={current === option.value}
						onPress={() => choose(option.value)}
					/>
				))}
			</GroupedList>
		</ScrollView>
	);
}
