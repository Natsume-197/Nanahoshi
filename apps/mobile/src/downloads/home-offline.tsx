import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Icon, icons } from "@/components/icon";
import { PillButton } from "@/components/pill-button";
import { PressableScale } from "@/components/pressable-scale";
import { showNotice } from "@/components/prompt";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { serverHost } from "@/lib/server-reachability";
import { useConnection, useServerStatus } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";
import { useDownloadedTitles } from "./provider";

const BUTTON_HEIGHT = 48;

/** Home without a server, as Netflix does it: nothing but the news and the
 * way to what still works. */
export function HomeOffline() {
	const palette = usePalette();
	const { titles } = useDownloadedTitles();
	const hasDownloads = titles.some((title) => title.complete);
	return (
		<View
			style={{
				flex: 1,
				alignItems: "center",
				justifyContent: "center",
				gap: space.md,
				paddingHorizontal: space.xxl,
				paddingVertical: 64,
			}}
		>
			<Icon name={icons.offline} size={48} color={palette.textTertiary} />
			<Text variant="title" style={{ textAlign: "center" }}>
				{t("mobile.downloads.offline_title")}
			</Text>
			<Text variant="subhead" tone="secondary" style={{ textAlign: "center" }}>
				{t(
					hasDownloads
						? "mobile.downloads.offline_desc"
						: "mobile.offline.no_downloads",
				)}
			</Text>
			{hasDownloads ? (
				<PressableScale
					onPress={() => router.push("/downloads")}
					accessibilityRole="button"
					style={{
						marginTop: space.md,
						height: BUTTON_HEIGHT,
						borderRadius: BUTTON_HEIGHT / 2,
						paddingHorizontal: space.xl,
						flexDirection: "row",
						alignItems: "center",
						gap: space.sm,
						backgroundColor: palette.text,
					}}
				>
					<Icon name={icons.download} size={20} color={palette.background} />
					<Text
						variant="headline"
						style={{ color: palette.background, fontWeight: "600" }}
					>
						{t("mobile.offline.go_to_downloads")}
					</Text>
				</PressableScale>
			) : null}
		</View>
	);
}

/** Home when the phone has a network but the server doesn't answer: the
 * server is off, or it moved to another address. Says which server, and
 * offers the way out of each case. */
export function HomeUnreachable() {
	const palette = usePalette();
	const { serverUrl } = useConnection();
	const server = useServerStatus();
	const { titles } = useDownloadedTitles();
	const hasDownloads = titles.some((title) => title.complete);
	const [checking, setChecking] = useState(false);
	const retry = async () => {
		setChecking(true);
		const up = await server.check();
		setChecking(false);
		if (!up) showNotice(t("mobile.server.still_unreachable"));
	};
	return (
		<View
			style={{
				flex: 1,
				alignItems: "center",
				justifyContent: "center",
				gap: space.md,
				paddingHorizontal: space.xxl,
				paddingVertical: 64,
			}}
		>
			<Icon name={icons.server} size={48} color={palette.textTertiary} />
			<Text variant="title" style={{ textAlign: "center" }}>
				{t("mobile.server.unreachable_title")}
			</Text>
			<Text variant="subhead" tone="secondary" style={{ textAlign: "center" }}>
				{t("mobile.server.unreachable_desc", { host: serverHost(serverUrl) })}
			</Text>
			<View
				style={{ alignSelf: "stretch", gap: space.sm, marginTop: space.md }}
			>
				<PillButton
					label={t("common.retry")}
					loading={checking}
					onPress={() => void retry()}
				/>
				<PillButton
					variant="quiet"
					label={t("mobile.server.change_address")}
					onPress={() => router.push("/server-address")}
				/>
				{hasDownloads ? (
					<PillButton
						variant="plain"
						label={t("mobile.offline.go_to_downloads")}
						onPress={() => router.push("/downloads")}
					/>
				) : null}
			</View>
		</View>
	);
}
