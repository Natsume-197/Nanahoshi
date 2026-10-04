import { router, Stack } from "expo-router";
import { ScrollView, View } from "react-native";
import { Cover } from "@/components/cover";
import { icons } from "@/components/icon";
import { OfflineState } from "@/components/states";
import { Text } from "@/components/text";
import { useDownloadedTitles } from "@/downloads/provider";
import { joinNames } from "@/lib/format";
import { t } from "@/lib/i18n";
import { usePlayer } from "@/player/provider";
import { space } from "@/theme";
import { PrimaryButton } from "./title-actions";

/** A title page offline with nothing cached: if the title is on the phone,
 * show what its download kept and open it; otherwise say it needs the server. */
export function OfflineTitle({ uuid }: { uuid: string }) {
	const player = usePlayer();
	const { titles } = useDownloadedTitles();
	const entry = titles.find((title) => title.uuid === uuid && title.complete);
	if (!entry) return <OfflineState />;
	const audio = entry.kind === "audiobook";
	return (
		<>
			<Stack.Screen options={{ title: "" }} />
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ padding: space.lg, gap: space.lg }}
			>
				<View style={{ alignItems: "center", paddingTop: space.xl }}>
					<Cover
						cover={entry.cover}
						localUri={entry.localCover}
						color={entry.color}
						width={audio ? 220 : 180}
						shape={audio ? "audio" : "book"}
					/>
				</View>
				<View style={{ gap: space.xs }}>
					<Text variant="title">{entry.title}</Text>
					{entry.authors.length > 0 ? (
						<Text variant="subhead" tone="secondary">
							{joinNames(entry.authors.map((name) => ({ name })))}
						</Text>
					) : null}
				</View>
				<View style={{ flexDirection: "row" }}>
					<PrimaryButton
						label={t(audio ? "mobile.offline.listen" : "mobile.offline.read")}
						icon={audio ? icons.play : icons.book}
						onPress={() => {
							if (!audio)
								return router.push({
									pathname: "/reader/[uuid]",
									params: { uuid },
								});
							void player.play(uuid);
							router.push("/player");
						}}
					/>
				</View>
				<Text variant="subhead" tone="secondary">
					{t("mobile.offline.title_desc")}
				</Text>
			</ScrollView>
		</>
	);
}
