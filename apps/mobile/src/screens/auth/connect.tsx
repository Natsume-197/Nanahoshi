import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { PrimaryButton } from "@/components/button";
import { Icon, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useMountEffect } from "@/hooks/use-mount-effect";
import {
	discoverServers,
	type FoundServer,
	probeServer,
} from "@/lib/discover-servers";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { normalizeServerUrl } from "@/lib/server-url";
import { useServer } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";
import { AuthScaffold } from "./auth-scaffold";

/** A typed address without a port also gets the Nanahoshi defaults tried,
 * so "192.168.1.20" finds a server on :7331 or :7333. */
function candidatesFor(input: string, url: string) {
	const typedPort = /:\d+(\/|$)/.test(input.replace(/^https?:\/\//i, ""));
	if (typedPort) return [url];
	return [url, `${url}:7331`, `${url}:7333`];
}

export function Connect() {
	const { serverUrl, setServerUrl } = useServer();
	const valueRef = useRef(serverUrl ?? "");
	const [error, setError] = useState<string | null>(null);
	const [checking, setChecking] = useState(false);
	const [scanKey, setScanKey] = useState(0);

	const submit = async () => {
		const url = normalizeServerUrl(valueRef.current);
		if (!url) {
			setError(t("mobile.connect.invalid"));
			return;
		}
		setError(null);
		setChecking(true);
		const controller = new AbortController();
		let found: string | null = null;
		for (const candidate of candidatesFor(valueRef.current, url)) {
			if (await probeServer(candidate, controller.signal)) {
				found = candidate;
				break;
			}
		}
		setChecking(false);
		if (!found) {
			setError(t("mobile.connect.unreachable"));
			return;
		}
		// A new server remounts the whole navigator on a fresh connection
		// (AppProvider keys it by URL), landing on sign-in with no way back here.
		await setServerUrl(found);
	};

	return (
		<AuthScaffold
			title={t("mobile.connect.title")}
			lead={t("mobile.connect.lead")}
		>
			<Discovery
				key={scanKey}
				onPick={(server) => setServerUrl(server.url)}
				onRescan={() => setScanKey((key) => key + 1)}
			/>
			<View style={{ gap: space.lg }}>
				<TextField
					label={t("mobile.connect.label")}
					defaultValue={serverUrl ?? ""}
					onChangeText={(text) => {
						valueRef.current = text;
					}}
					placeholder={t("mobile.connect.placeholder")}
					autoCapitalize="none"
					autoCorrect={false}
					keyboardType="url"
					textContentType="URL"
					returnKeyType="go"
					onSubmitEditing={submit}
				/>
				{error ? (
					<Text
						variant="subhead"
						tone="danger"
						selectable
						accessibilityLiveRegion="polite"
					>
						{error}
					</Text>
				) : null}
				<PrimaryButton
					label={t("mobile.connect.action")}
					onPress={submit}
					loading={checking}
				/>
			</View>
		</AuthScaffold>
	);
}

/** Scans the phone's network once on mount; remounted (new key) to rescan. */
function Discovery({
	onPick,
	onRescan,
}: {
	onPick: (server: FoundServer) => void;
	onRescan: () => void;
}) {
	const palette = usePalette();
	const [servers, setServers] = useState<FoundServer[]>([]);
	const [progress, setProgress] = useState(0);
	const [finished, setFinished] = useState(false);
	const [noNetwork, setNoNetwork] = useState(false);

	useMountEffect(() => {
		const controller = new AbortController();
		discoverServers(
			controller.signal,
			(server) =>
				setServers((current) =>
					current.some((s) => s.url === server.url)
						? current
						: [...current, server],
				),
			(done, total) => setProgress(done / total),
		).then(({ scanned }) => {
			if (controller.signal.aborted) return;
			setNoNetwork(!scanned);
			setFinished(true);
		});
		return () => controller.abort();
	});

	return (
		<View style={{ gap: space.md }}>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "space-between",
					minHeight: 32,
				}}
			>
				<Text variant="subhead" tone="secondary" style={{ fontWeight: "600" }}>
					{t("mobile.connect.found_title")}
				</Text>
				{finished ? (
					<Pressable
						onPress={onRescan}
						accessibilityRole="button"
						hitSlop={8}
						style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
					>
						<Text variant="subhead" tone="accent" style={{ fontWeight: "600" }}>
							{t("mobile.connect.rescan")}
						</Text>
					</Pressable>
				) : (
					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: space.sm,
						}}
					>
						<ActivityIndicator size="small" color={palette.textSecondary} />
						<Text
							variant="caption"
							tone="secondary"
							style={{ fontVariant: ["tabular-nums"] }}
						>
							{Math.round(progress * 100)}%
						</Text>
					</View>
				)}
			</View>

			{servers.length > 0 ? (
				<View
					style={{
						borderRadius: radius.card,
						borderCurve: "continuous",
						overflow: "hidden",
						backgroundColor: palette.surface,
					}}
				>
					{servers.map((server, index) => (
						<Pressable
							android_ripple={{ color: palette.ripple }}
							key={server.url}
							onPress={() => onPick(server)}
							accessibilityRole="button"
							accessibilityLabel={`${t("mobile.connect.use_server")} ${server.host}`}
							style={({ pressed }) => ({
								flexDirection: "row",
								alignItems: "center",
								gap: space.md,
								minHeight: 56,
								paddingHorizontal: space.lg,
								borderTopWidth: index === 0 ? 0 : 1,
								borderColor: palette.separator,
								backgroundColor:
									pressed && !IS_ANDROID ? palette.separator : "transparent",
							})}
						>
							<Icon name={icons.server} size={20} color={palette.accent} />
							<View style={{ flex: 1, gap: 2 }}>
								<Text variant="headline">Nanahoshi</Text>
								<Text
									variant="subhead"
									tone="secondary"
									selectable
									style={{ fontVariant: ["tabular-nums"] }}
								>
									{server.host}
								</Text>
							</View>
							<Icon
								name={icons.chevronRight}
								size={16}
								color={palette.textTertiary}
							/>
						</Pressable>
					))}
				</View>
			) : (
				<Text variant="subhead" tone="tertiary">
					{finished
						? noNetwork
							? t("mobile.connect.no_wifi")
							: t("mobile.connect.none_found")
						: t("mobile.connect.searching")}
				</Text>
			)}
		</View>
	);
}
