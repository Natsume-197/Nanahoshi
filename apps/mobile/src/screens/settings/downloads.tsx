import { ScrollView } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { icons } from "@/components/icon";
import { Toggle } from "@/components/toggle";
import {
	smartDownloads,
	smartOnCellular,
	useSmartDownloads,
	useSmartOnCellular,
} from "@/downloads/smart-settings";
import { t } from "@/lib/i18n";
import { useMiniPlayerInset } from "@/player/mini-player";
import { space } from "@/theme";

export function DownloadSettingsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const smart = useSmartDownloads();
	const cellular = useSmartOnCellular();
	return (
		<ScrollView
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				padding: space.lg,
				paddingBottom: space.lg + miniPlayerInset,
				gap: space.xl,
			}}
		>
			<GroupedList footer={t("mobile.smart.footer")}>
				<GroupedRow
					first
					icon={icons.download}
					label={t("mobile.smart.title")}
					subtitle={t("mobile.smart.desc")}
					trailing={
						<Toggle
							value={smart}
							onValueChange={(on) => void smartDownloads.set(on)}
						/>
					}
				/>
				<GroupedRow
					label={t("mobile.smart.cellular")}
					subtitle={t("mobile.smart.cellular_desc")}
					trailing={
						<Toggle
							value={cellular}
							onValueChange={(on) => void smartOnCellular.set(on)}
						/>
					}
				/>
			</GroupedList>
		</ScrollView>
	);
}
