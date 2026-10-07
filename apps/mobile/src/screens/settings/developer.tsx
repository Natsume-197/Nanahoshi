import { router } from "expo-router";
import { ScrollView } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { icons } from "@/components/icon";
import { Toggle } from "@/components/toggle";
import { hideDeveloperOptions } from "@/lib/developer-mode";
import { t } from "@/lib/i18n";
import { simulatedOffline, useSimulatedOffline } from "@/lib/simulated-offline";
import { useMiniPlayerInset } from "@/player/mini-player";
import { space } from "@/theme";

export function DeveloperSettingsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const offline = useSimulatedOffline();
	return (
		<ScrollView
			showsVerticalScrollIndicator={false}
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				paddingBottom: space.lg + miniPlayerInset,
			}}
		>
			<GroupedList>
				<GroupedRow
					first
					icon={icons.offline}
					label={t("mobile.settings.simulate_offline")}
					subtitle={t("mobile.settings.simulate_offline_desc")}
					trailing={
						<Toggle
							value={offline}
							onValueChange={(on) => void simulatedOffline.set(on)}
						/>
					}
				/>
			</GroupedList>
			<GroupedList>
				<GroupedRow
					first
					inset
					label={t("mobile.settings.developer_hide")}
					onPress={async () => {
						await hideDeveloperOptions();
						router.back();
					}}
				/>
			</GroupedList>
		</ScrollView>
	);
}
