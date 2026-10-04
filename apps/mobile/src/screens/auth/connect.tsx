import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Icon, icons } from "@/components/icon";
import { PillButton } from "@/components/pill-button";
import { Spinner } from "@/components/states";
import { Text } from "@/components/text";
import { TextField } from "@/components/text-field";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { markServerConnected } from "@/lib/auth-entry";
import {
	discoverServers,
	type FoundServer,
	probeServer,
} from "@/lib/discover-servers";
import { t } from "@/lib/i18n";
import { normalizeServerUrl } from "@/lib/server-url";
import { useServer } from "@/providers/app-provider";
import { SetupStep } from "@/screens/setup/scaffold";
import { radius, space, usePalette } from "@/theme";

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
	const [hasValue, setHasValue] = useState(!!serverUrl);
	const [error, setError] = useState<string | null>(null);
	const [checking, setChecking] = useState(false);
	const [scanKey, setScanKey] = useState(0);
	const [typing, setTyping] = useState(false);
	const [noneFound, setNoneFound] = useState(false);

	const pick = async (url: string) => {
		markServerConnected();
		await setServerUrl(url);
	};

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
		// (AppProvider keys it by URL); the welcome screen carries on to sign-in.
		await pick(found);
	};

	// The address field waits behind a row; with nothing found it just shows.
	const showField = typing || noneFound;

	return (
		<SetupStep
			leading={router.canGoBack() ? "back" : "none"}
			title={t("mobile.connect.pick_title")}
			footer={
				showField ? (
					<PillButton
						label={t("mobile.connect.action")}
						onPress={submit}
						loading={checking}
						disabled={!hasValue}
					/>
				) : null
			}
		>
			<Discovery
				key={scanKey}
				current={serverUrl}
				onPick={(server) => pick(server.url)}
				onRescan={() => {
					setNoneFound(false);
					setScanKey((key) => key + 1);
				}}
				onFinished={(count) => setNoneFound(count === 0)}
			/>
			{showField ? (
				<View style={{ gap: space.sm }}>
					<TextField
						large
						label={t("mobile.connect.label")}
						defaultValue={serverUrl ?? ""}
						autoFocus={typing}
						onChangeText={(text) => {
							valueRef.current = text;
							setHasValue(!!text.trim());
						}}
						placeholder={t("mobile.connect.placeholder_short")}
						autoCapitalize="none"
						autoCorrect={false}
						keyboardType="url"
						textContentType="URL"
						returnKeyType="go"
						onSubmitEditing={submit}
					/>
					<Text
						variant="subhead"
						tone={error ? "danger" : "tertiary"}
						selectable={!!error}
						accessibilityLiveRegion="polite"
					>
						{error ?? t("mobile.connect.hint")}
					</Text>
				</View>
			) : (
				<TypeAddressRow onPress={() => setTyping(true)} />
			)}
		</SetupStep>
	);
}

function TypeAddressRow({ onPress }: { onPress: () => void }) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			hitSlop={8}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.sm,
				alignSelf: "flex-start",
				paddingVertical: space.sm,
				opacity: pressed ? 0.6 : 1,
			})}
		>
			<Icon name={icons.link} size={18} color={palette.text} />
			<Text variant="body" style={{ fontWeight: "600" }}>
				{t("mobile.connect.type_address")}
			</Text>
		</Pressable>
	);
}

/**
 * Nanahoshi servers on this Wi-Fi, found while the person reads the screen:
 * one tap connects. Only shows up once there is something to show.
 */
function Discovery({
	current,
	onPick,
	onRescan,
	onFinished,
}: {
	current: string | null;
	onPick: (server: FoundServer) => void;
	onRescan: () => void;
	onFinished: (count: number) => void;
}) {
	const palette = usePalette();
	const [servers, setServers] = useState<FoundServer[]>([]);
	const [finished, setFinished] = useState(false);
	const found = useRef(new Set<string>());

	useMountEffect(() => {
		const controller = new AbortController();
		discoverServers(
			controller.signal,
			(server) => {
				if (found.current.has(server.url)) return;
				found.current.add(server.url);
				setServers((current) => [...current, server]);
			},
			() => {},
		).then(() => {
			if (controller.signal.aborted) return;
			setFinished(true);
			onFinished(found.current.size);
		});
		return () => controller.abort();
	});

	return (
		<View style={{ gap: space.sm }}>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					gap: space.sm,
					minHeight: 28,
				}}
			>
				<Text variant="label" tone="secondary" style={{ flex: 1 }}>
					{finished
						? t("mobile.connect.found_title")
						: t("mobile.connect.searching_short")}
				</Text>
				{finished ? (
					<Pressable onPress={onRescan} accessibilityRole="button" hitSlop={10}>
						<Text variant="label" tone="accent">
							{t("mobile.connect.rescan")}
						</Text>
					</Pressable>
				) : (
					<Spinner inline tone="tertiary" />
				)}
			</View>
			{servers.length === 0 ? (
				finished ? (
					<Text variant="subhead" tone="tertiary">
						{t("mobile.connect.none_found_short")}
					</Text>
				) : null
			) : (
				servers.map((server) => (
					<Pressable
						key={server.url}
						onPress={() => onPick(server)}
						accessibilityRole="button"
						accessibilityLabel={`${t("mobile.connect.use_server")} ${server.host}`}
						android_ripple={{ color: palette.ripple }}
						style={({ pressed }) => ({
							flexDirection: "row",
							alignItems: "center",
							gap: space.md,
							height: 56,
							paddingHorizontal: space.lg,
							borderRadius: radius.card,
							borderCurve: "continuous",
							overflow: "hidden",
							backgroundColor:
								pressed && process.env.EXPO_OS === "ios"
									? palette.surfaceCardHover
									: palette.surfaceCard,
						})}
					>
						<Icon name={icons.server} size={20} color={palette.textSecondary} />
						<Text
							variant="body"
							numberOfLines={1}
							style={{ flex: 1, fontVariant: ["tabular-nums"] }}
						>
							{server.host}
						</Text>
						{server.url === current ? (
							<Icon
								name={icons.check}
								size={18}
								color={palette.accent}
								weight="bold"
							/>
						) : (
							<Icon
								name={icons.chevronRight}
								size={14}
								color={palette.textTertiary}
							/>
						)}
					</Pressable>
				))
			)}
		</View>
	);
}
