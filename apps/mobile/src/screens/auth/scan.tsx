import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Linking, View } from "react-native";
import { Icon, icons } from "@/components/icon";
import { PillButton } from "@/components/pill-button";
import { Spinner } from "@/components/states";
import { Text } from "@/components/text";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { parsePairLink } from "@/lib/pair-link";
import { SetupStep } from "@/screens/setup/scaffold";
import { radius, space, usePalette } from "@/theme";

/**
 * Scans the QR the web shows under Settings → Mobile app. The camera is
 * asked for here, with what it's for, and only when someone wants to scan.
 */
export function Scan() {
	const [permission, requestPermission] = useCameraPermissions();
	if (!permission)
		return (
			<SetupStep title={t("mobile.pair.scan_title")}>
				<Spinner />
			</SetupStep>
		);
	if (!permission.granted) {
		const blocked = !permission.canAskAgain;
		return (
			<SetupStep
				title={t("mobile.pair.camera_title")}
				lead={t("mobile.pair.camera_lead")}
				footer={
					<PillButton
						label={
							blocked
								? t("mobile.pair.camera_settings")
								: t("mobile.pair.camera_allow")
						}
						onPress={() =>
							blocked ? void Linking.openSettings() : void requestPermission()
						}
					/>
				}
			/>
		);
	}
	return <Viewfinder />;
}

function Viewfinder() {
	const palette = usePalette();
	const [wrongCode, setWrongCode] = useState(false);
	// The camera reports the same code many times a second.
	const handled = useRef(false);
	const lastWrong = useRef<string | null>(null);

	const onScanned = ({ data }: { data: string }) => {
		if (handled.current) return;
		const link = parsePairLink(data);
		if (!link) {
			if (lastWrong.current !== data) {
				lastWrong.current = data;
				haptics.error();
				setWrongCode(true);
			}
			return;
		}
		handled.current = true;
		haptics.success();
		router.replace({ pathname: "/pair", params: link });
	};

	return (
		<SetupStep
			title={t("mobile.pair.scan_title")}
			lead={t("mobile.pair.scan_hint")}
		>
			<View
				style={{
					aspectRatio: 1,
					width: "100%",
					borderRadius: radius.card,
					borderCurve: "continuous",
					overflow: "hidden",
					backgroundColor: palette.surfaceCard,
				}}
			>
				<CameraView
					style={{ flex: 1 }}
					facing="back"
					barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
					onBarcodeScanned={onScanned}
				/>
			</View>
			<View
				style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
				accessibilityLiveRegion="polite"
			>
				<Icon
					name={icons.qrScan}
					size={18}
					color={wrongCode ? palette.danger : palette.textSecondary}
				/>
				<Text
					variant="subhead"
					tone={wrongCode ? "danger" : "secondary"}
					style={{ flex: 1 }}
				>
					{wrongCode ? t("mobile.pair.not_ours") : t("mobile.pair.scan_where")}
				</Text>
			</View>
		</SetupStep>
	);
}
