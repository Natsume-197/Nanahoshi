import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { ScrollView, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { icons } from "@/components/icon";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { useConnection } from "@/providers/app-provider";
import { space } from "@/theme";

const PROJECT_URL = "https://github.com/Natsume-197/Nanahoshi";

export function AboutSettingsScreen() {
	const { serverUrl } = useConnection();
	const open = (url: string) => () => void WebBrowser.openBrowserAsync(url);
	return (
		<ScrollView
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{ padding: space.lg, gap: space.xl }}
		>
			<View style={{ gap: space.xs, paddingHorizontal: space.sm }}>
				<Text variant="title">Nanahoshi</Text>
				<Text variant="subhead" tone="secondary">
					{t("settings.about.tagline")}
				</Text>
			</View>
			<GroupedList>
				<GroupedRow
					first
					label={t("mobile.settings.app_version")}
					value={
						Constants.expoConfig?.version ?? t("settings.about.unavailable")
					}
				/>
				<GroupedRow label={t("nav.server")} value={serverUrl} />
			</GroupedList>
			<GroupedList>
				<GroupedRow
					first
					icon={icons.code}
					label={t("settings.about.source_code")}
					onPress={open(PROJECT_URL)}
				/>
				<GroupedRow
					icon={icons.whatsNew}
					label={t("settings.about.whats_new")}
					onPress={open(`${PROJECT_URL}/releases`)}
				/>
				<GroupedRow
					icon={icons.bug}
					label={t("settings.about.report_issue")}
					onPress={open(`${PROJECT_URL}/issues/new`)}
				/>
			</GroupedList>
		</ScrollView>
	);
}
