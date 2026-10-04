import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { ActionSheet } from "@/components/action-menu/action-sheet";
import { isMenuGroup, type MenuItem } from "@/components/action-menu/types";
import type { BookTarget } from "@/components/book-menu";
import { useBookMenu } from "@/components/book-menu/use-book-menu";
import { Icon, type IconName, icons } from "@/components/icon";
import { Spinner } from "@/components/states";
import { useDownloadActions } from "@/downloads/use-download-actions";
import { t } from "@/lib/i18n";
import { usePalette } from "@/theme";

/**
 * The top-right corner of a title's page: its download state as one icon
 * (arrow → spinner → filled arrow, all in ink) and ⋮ with the rest. iOS gets native bar
 * items and a UIMenu; Android plain buttons, with the Material sheet mounted
 * in the page body since a Compose menu inside the header never attaches.
 */
export function DetailHeaderMenu({ target }: { target: BookTarget }) {
	const { items } = useBookMenu(target, true);
	const download = useDownloadActions(target.kind, target.uuid, target.title);
	const [open, setOpen] = useState(false);
	const ios = process.env.EXPO_OS === "ios";
	const state = download.status.state;
	const busy = state === "queued" || state === "downloading";
	const percent =
		state === "downloading" ? Math.round(download.status.progress * 100) : 0;
	const downloadButton =
		!download.allowed && !busy && state !== "done"
			? null
			: busy
				? {
						label: t("mobile.downloads.downloading", { percent }),
						onPress: download.cancel,
					}
				: state === "done"
					? {
							label: t("mobile.downloads.remove"),
							icon: icons.downloaded,
							onPress: download.remove,
						}
					: {
							label: t("mobile.downloads.download"),
							icon:
								state === "failed" || state === "partial"
									? icons.retry
									: icons.download,
							onPress: download.start,
						};

	return (
		<>
			<Stack.Screen
				options={{
					unstable_headerRightItems: ios
						? () => [
								{
									type: "menu",
									label: t("nav.more"),
									icon: { type: "sfSymbol", name: icons.moreVertical.ios },
									menu: {
										items: items.map((section) => ({
											type: "submenu" as const,
											label: "",
											inline: true,
											items: section.map((entry) =>
												isMenuGroup(entry)
													? {
															type: "submenu" as const,
															label: entry.label,
															icon: {
																type: "sfSymbol" as const,
																name: entry.icon.ios,
															},
															items: entry.sections.flat().map(headerAction),
														}
													: headerAction(entry),
											),
										})),
									},
								},
								...(downloadButton
									? [
											busy
												? // A bar item can't host a spinner: the percentage is the progress.
													{
														type: "button" as const,
														label: `${percent}%`,
														accessibilityLabel: downloadButton.label,
														onPress: downloadButton.onPress,
													}
												: {
														type: "button" as const,
														label: downloadButton.label,
														icon: {
															type: "sfSymbol" as const,
															name: (downloadButton.icon ?? icons.download).ios,
														},
														onPress: downloadButton.onPress,
													},
										]
									: []),
							]
						: undefined,
					headerRight: ios
						? undefined
						: () => (
								<View style={{ flexDirection: "row", alignItems: "center" }}>
									{downloadButton ? (
										<HeaderButton
											label={downloadButton.label}
											icon={downloadButton.icon}
											busy={busy}
											onPress={downloadButton.onPress}
										/>
									) : null}
									<HeaderButton
										label={t("nav.more")}
										icon={icons.moreVertical}
										onPress={() => setOpen(true)}
									/>
								</View>
							),
				}}
			/>
			{open ? (
				<ActionSheet sections={items} onClose={() => setOpen(false)} />
			) : null}
		</>
	);
}

function headerAction(item: MenuItem) {
	return {
		type: "action" as const,
		label: item.label,
		icon: { type: "sfSymbol" as const, name: item.icon.ios },
		destructive: item.destructive,
		onPress: item.onPress,
	};
}

function HeaderButton({
	label,
	icon,
	busy,
	onPress,
}: {
	label: string;
	icon?: IconName;
	busy?: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			android_ripple={{ color: palette.ripple, borderless: true, radius: 22 }}
			style={{
				width: 44,
				height: 44,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{busy ? (
				<Spinner inline tone="primary" />
			) : icon ? (
				<Icon name={icon} size={24} color={palette.text} />
			) : null}
		</Pressable>
	);
}
