import { router } from "expo-router";
import { Pressable, useColorScheme, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { takeServerConnected } from "@/lib/auth-entry";
import { t } from "@/lib/i18n";
import { useMaybeConnection } from "@/providers/app-provider";
import { neutralRipple, radius, space } from "@/theme";
import { PaperButton, ServerRow, SignInOptions } from "./entry-parts";
import { rise } from "./welcome";
import {
	FOOT_INSET,
	GUTTER,
	PAPER,
	type Paper,
	SECTION_GAP,
} from "./welcome-paper";

/**
 * The way in, on its own flat page (Fits' sign-in): back to the tour, the
 * heading, which server this goes to, and every way in at the bottom.
 * Without a server it asks for one first.
 */
export function Enter() {
	const connection = useMaybeConnection();
	const insets = useSafeAreaInsets();
	const paper = PAPER[useColorScheme() === "dark" ? "dark" : "light"];
	// Just picked a server: the navigation remounted here; carry on to sign in.
	useMountEffect(() => {
		if (takeServerConnected()) router.push("/sign-in");
	});
	const host = connection?.serverUrl.replace(/^https?:\/\//, "") ?? null;
	// Came from the tour: step back to it. Opened directly: bring it up.
	const backToTour = () => {
		if (router.canGoBack()) router.back();
		else router.replace({ pathname: "/welcome", params: { tour: "1" } });
	};

	return (
		<View
			style={{
				flex: 1,
				backgroundColor: paper.paper,
				paddingTop: insets.top + space.md,
				paddingBottom: insets.bottom + FOOT_INSET,
				paddingHorizontal: GUTTER,
			}}
		>
			<BackButton paper={paper} onPress={backToTour} />

			<View style={{ marginTop: space.xl, gap: SECTION_GAP }}>
				<View style={{ gap: space.md }}>
					<Animated.View entering={rise(0)}>
						<Text
							variant="display"
							accessibilityRole="header"
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.8}
							style={{
								color: paper.ink,
								fontSize: 28,
								lineHeight: 33,
								letterSpacing: -0.5,
							}}
						>
							{connection
								? t("mobile.enter.title_any")
								: t("mobile.enter.connect_title")}
						</Text>
					</Animated.View>
					<Animated.View entering={rise(1)}>
						<Text
							variant="body"
							style={{ color: paper.inkSoft, fontSize: 16, lineHeight: 23 }}
						>
							{connection
								? t("mobile.enter.lead")
								: t("mobile.enter.connect_lead")}
						</Text>
					</Animated.View>
				</View>
				{connection && host ? (
					<Animated.View entering={rise(2)}>
						<ServerRow host={host} api={connection.api} paper={paper} />
					</Animated.View>
				) : null}
			</View>

			<Animated.View
				entering={rise(3)}
				style={{ marginTop: "auto", gap: space.md }}
			>
				{connection ? (
					<SignInOptions
						api={connection.api}
						auth={connection.auth}
						serverUrl={connection.serverUrl}
						paper={paper}
					/>
				) : (
					<PaperButton
						filled
						paper={paper}
						label={t("mobile.welcome.connect")}
						onPress={() => router.push("/connect")}
					/>
				)}
			</Animated.View>
		</View>
	);
}

function BackButton({ paper, onPress }: { paper: Paper; onPress: () => void }) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={t("mobile.enter.tour")}
			hitSlop={8}
			android_ripple={{ color: neutralRipple, borderless: true }}
			style={({ pressed }) => ({
				width: 44,
				height: 44,
				borderRadius: radius.pill,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: paper.tint,
				opacity: pressed && process.env.EXPO_OS === "ios" ? 0.7 : 1,
			})}
		>
			<Icon name={icons.back} size={20} color={paper.ink} />
		</Pressable>
	);
}
