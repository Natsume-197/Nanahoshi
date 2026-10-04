import { router, Stack } from "expo-router";
import { Pressable } from "react-native";
import { Icon, icons } from "@/components/icon";
import { useLibraryScan } from "@/components/library-menu/use-library-menu";
import { askChoice } from "@/components/prompt";
import { useCan } from "@/lib/abilities";
import { t } from "@/lib/i18n";
import { usePalette } from "@/theme";

/** A library page's ⋮: the web's scan actions, for those who may scan.
 * The work runs on the server; its progress lives on the Tasks page. */
export function LibraryHeaderMenu({ uuid }: { uuid: string }) {
	const can = useCan();
	const palette = usePalette();
	const scan = useLibraryScan(uuid);
	if (!can("library", "scan")) return null;

	const open = async () => {
		const answer = await askChoice({
			title: t("library.scan_options"),
			options: [
				{ id: "scan", label: t("library.scan_now"), icon: icons.retry },
				{ id: "full", label: t("library.full_scan"), icon: icons.search },
				{ id: "reprocess", label: t("library.reprocess"), icon: icons.book },
				{ id: "tasks", label: t("settings.nav.tasks"), icon: icons.tasks },
			],
		});
		if (answer === "scan") scan.scanNow();
		else if (answer === "reprocess") scan.reprocess();
		else if (answer === "tasks") router.push("/tasks");
		else if (answer === "full") await scan.fullScan();
	};

	return (
		<Stack.Screen
			options={
				process.env.EXPO_OS === "ios"
					? {
							unstable_headerRightItems: () => [
								{
									type: "button",
									label: t("library.scan_options"),
									icon: { type: "sfSymbol", name: icons.more.ios },
									onPress: () => void open(),
								},
							],
						}
					: {
							headerRight: () => (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={t("library.scan_options")}
									onPress={() => void open()}
									android_ripple={{
										color: palette.ripple,
										borderless: true,
										radius: 20,
									}}
									style={{
										width: 48,
										height: 48,
										alignItems: "center",
										justifyContent: "center",
									}}
								>
									<Icon name={icons.more} size={24} color={palette.text} />
								</Pressable>
							),
						}
			}
		/>
	);
}
