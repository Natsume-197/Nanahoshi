import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useRef } from "react";
import { ScrollView, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { icons } from "@/components/icon";
import { showInfo } from "@/components/prompt";
import { Text } from "@/components/text";
import { developerMode } from "@/lib/developer-mode";
import { t } from "@/lib/i18n";
import {
	ANNOUNCE_FROM,
	NO_TAPS,
	registerTap,
	type TapState,
} from "@/lib/tap-unlock";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useConnection } from "@/providers/app-provider";
import { space } from "@/theme";

const PROJECT_URL = "https://github.com/Natsume-197/Nanahoshi";

export function AboutSettingsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const { serverUrl } = useConnection();
	const open = (url: string) => () => void WebBrowser.openBrowserAsync(url);
	const taps = useRef<TapState>(NO_TAPS);
	const tapVersion = () => {
		if (developerMode.isOn()) {
			showInfo(t("mobile.settings.developer_already"));
			return;
		}
		const tap = registerTap(taps.current, Date.now());
		taps.current = tap.state;
		if (tap.remaining === 0) {
			taps.current = NO_TAPS;
			void developerMode.set(true);
			showInfo(t("mobile.settings.developer_unlocked"));
		} else if (tap.state.count >= ANNOUNCE_FROM) {
			showInfo(
				tap.remaining === 1
					? t("mobile.settings.developer_steps_one")
					: t("mobile.settings.developer_steps", { count: tap.remaining }),
			);
		}
	};
	return (
		<ScrollView
			showsVerticalScrollIndicator={false}
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				paddingBottom: space.lg + miniPlayerInset,
			}}
		>
			<View
				style={{ gap: space.xs, padding: space.lg, paddingBottom: space.xl }}
			>
				<Text variant="title">Nanahoshi</Text>
				<Text variant="subhead" tone="secondary">
					{t("settings.about.tagline")}
				</Text>
			</View>
			<GroupedList>
				<GroupedRow
					first
					inset
					label={t("mobile.settings.app_version")}
					onPress={tapVersion}
					value={
						Constants.expoConfig?.version ?? t("settings.about.unavailable")
					}
				/>
				<GroupedRow inset label={t("nav.server")} value={serverUrl} />
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
