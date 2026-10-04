import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { DiscordMark } from "@/components/discord-mark";
import { GoogleMark } from "@/components/google-mark";
import { Icon, type IconName, icons } from "@/components/icon";
import { showNotice } from "@/components/prompt";
import { Text } from "@/components/text";
import type { Api } from "@/lib/api";
import type { NanahoshiAuth } from "@/lib/auth-client";
import { t } from "@/lib/i18n";
import { radius, space } from "@/theme";
import { type Paper, SECTION_GAP } from "./welcome-paper";

/** This server's ways in: providers as soft pills, email filled, then
 * what continuing accepts. */
export function SignInOptions({
	api,
	auth,
	serverUrl,
	paper,
}: {
	api: Api;
	auth: NanahoshiAuth;
	serverUrl: string;
	paper: Paper;
}) {
	const sso = useQuery({
		...api.orpc.setup.ssoStatus.queryOptions(),
		staleTime: 60_000,
	});
	// The Expo client opens the provider in the system's auth browser and
	// keeps the returned session cookie; the session then flips the root guard.
	const continueWith = async (provider: string) => {
		const result = await auth.signIn.social({ provider, callbackURL: "/" });
		if (result?.error) showNotice(t("mobile.signin.provider_failed"));
	};
	return (
		<>
			{sso.data?.google ? (
				<PaperButton
					paper={paper}
					mark={<GoogleMark />}
					label={t("mobile.welcome.continue_with", { provider: "Google" })}
					onPress={() => continueWith("google")}
				/>
			) : null}
			{sso.data?.enabled ? (
				<PaperButton
					paper={paper}
					icon={icons.key}
					label={t("mobile.welcome.continue_with", {
						provider: sso.data.label,
					})}
					onPress={() => continueWith(sso.data.providerId)}
				/>
			) : null}
			{sso.data?.discord ? (
				<PaperButton
					paper={paper}
					mark={<DiscordMark />}
					label={t("mobile.welcome.continue_with", { provider: "Discord" })}
					onPress={() => continueWith("discord")}
				/>
			) : null}
			<PaperButton
				filled
				paper={paper}
				label={t("mobile.welcome.continue_email")}
				onPress={() => router.push("/sign-in")}
			/>
			<LegalLine
				paper={paper}
				terms={sso.data?.legal?.terms ?? `${serverUrl}/legal/terms`}
				privacy={sso.data?.legal?.privacy ?? `${serverUrl}/legal/privacy`}
			/>
		</>
	);
}

/**
 * Which server this sign-in goes to, as its own row (Fits' choice rows):
 * the name its admin gave it over its address, and "Change". Turns amber
 * when the server doesn't answer, before anyone types a password.
 */
export function ServerRow({
	host,
	api,
	paper,
}: {
	host: string;
	api: Api;
	paper: Paper;
}) {
	// Same query as the sign-in options, so this costs no extra request.
	const sso = useQuery({
		...api.orpc.setup.ssoStatus.queryOptions(),
		staleTime: 60_000,
	});
	const offline = sso.isError;
	// Older servers send no name; the address alone still says which.
	const name = sso.data?.instanceName;
	return (
		<Pressable
			onPress={() => router.push("/connect")}
			accessibilityRole="button"
			accessibilityLabel={[
				name,
				host,
				offline ? t("mobile.welcome.server_offline") : null,
				t("mobile.signin.change_server"),
			]
				.filter(Boolean)
				.join(", ")}
			android_ripple={{ color: "rgba(127,127,127,0.18)" }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				minHeight: 68,
				paddingHorizontal: space.lg,
				paddingVertical: space.md,
				borderRadius: 16,
				borderCurve: "continuous",
				overflow: "hidden",
				backgroundColor: paper.tint,
				opacity: pressed && process.env.EXPO_OS === "ios" ? 0.7 : 1,
			})}
		>
			<View
				style={{
					width: 40,
					height: 40,
					borderRadius: radius.pill,
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: paper.paper,
				}}
			>
				<Icon
					name={offline ? icons.warning : icons.server}
					size={20}
					color={offline ? paper.offline : paper.ink}
				/>
			</View>
			<View style={{ flex: 1, gap: 2 }}>
				<Text
					variant="label"
					numberOfLines={1}
					style={{
						color: paper.ink,
						fontSize: 16,
						lineHeight: 21,
						fontWeight: "600",
					}}
				>
					{name ?? host}
				</Text>
				<Text
					variant="caption"
					numberOfLines={1}
					style={{
						color: offline ? paper.offline : paper.inkSoft,
						fontSize: 13,
						lineHeight: 18,
					}}
				>
					{offline
						? t("mobile.welcome.server_offline")
						: name
							? host
							: t("mobile.enter.server")}
				</Text>
			</View>
			<Text
				variant="label"
				style={{
					color: paper.ink,
					fontSize: 15,
					lineHeight: 20,
					fontWeight: "500",
				}}
			>
				{t("mobile.enter.change")}
			</Text>
		</Pressable>
	);
}

/** Fable's pill on paper: a soft tint for a provider, solid ink for the main
 * way in, `plain` just the label for a quiet second choice under it. */
export function PaperButton({
	label,
	icon,
	mark,
	filled,
	plain,
	paper,
	onPress,
}: {
	label: string;
	icon?: IconName;
	mark?: ReactNode;
	filled?: boolean;
	plain?: boolean;
	paper: Paper;
	onPress: () => void;
}) {
	const ink = filled ? paper.onFill : paper.ink;
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			android_ripple={{ color: "rgba(127,127,127,0.18)" }}
			style={({ pressed }) => ({
				height: plain ? 46 : 54,
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "center",
				gap: space.md,
				borderRadius: radius.pill,
				overflow: "hidden",
				backgroundColor: filled
					? paper.fill
					: plain
						? "transparent"
						: paper.tint,
				opacity: pressed && process.env.EXPO_OS === "ios" ? 0.85 : 1,
			})}
		>
			{mark ?? (icon ? <Icon name={icon} size={20} color={ink} /> : null)}
			<Text
				variant="headline"
				style={{ color: ink, fontSize: 16, fontWeight: "600" }}
			>
				{label}
			</Text>
		</Pressable>
	);
}

/**
 * Fable's "By continuing, you agree to…": what signing in here accepts —
 * this server's own documents, opened in the in-app browser.
 */
export function LegalLine({
	paper,
	terms,
	privacy,
}: {
	paper: Paper;
	terms: string;
	privacy: string;
}) {
	const link = {
		color: paper.ink,
		fontSize: 13,
		lineHeight: 19,
		fontWeight: "500" as const,
		textDecorationLine: "underline" as const,
	};
	const open = (url: string) => void WebBrowser.openBrowserAsync(url);
	return (
		<Text
			variant="caption"
			style={{
				color: paper.inkSoft,
				fontSize: 13,
				lineHeight: 19,
				// Sits in the buttons' column (gap md): this makes it SECTION_GAP
				// below them, the same air as between the heading and the buttons.
				paddingTop: SECTION_GAP - space.md,
			}}
		>
			{t("mobile.welcome.legal_prefix")}{" "}
			<Text
				variant="caption"
				style={link}
				accessibilityRole="link"
				onPress={() => open(terms)}
			>
				{t("mobile.welcome.legal_terms")}
			</Text>{" "}
			{t("mobile.welcome.legal_and")}{" "}
			<Text
				variant="caption"
				style={link}
				accessibilityRole="link"
				onPress={() => open(privacy)}
			>
				{t("mobile.welcome.legal_privacy")}
			</Text>
			.
		</Text>
	);
}
