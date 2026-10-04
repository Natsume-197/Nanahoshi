import type { ReadListenBarState } from "@nanahoshi/reader-bridge";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { icons } from "@/components/icon";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import {
	PlayPauseGlyph,
	TransportButton,
	usePlayLabel,
} from "@/player/controls";
import { usePlayer, usePlayerState } from "@/player/provider";
import { space, usePalette } from "@/theme";

type Command = "toggle-follow" | "toggle-seek" | "exit";

/**
 * The web's Read & Listen player dock on the phone: what is being narrated,
 * the two reading modes (follow the narration, tap a sentence to jump), the
 * transport, and the way out. Tapping the text opens the full player.
 */
export function ReadListenBar({
	bar,
	onCommand,
}: {
	bar: ReadListenBarState;
	onCommand: (command: Command) => void;
}) {
	const palette = usePalette();
	const insets = useSafeAreaInsets();
	const player = usePlayer();
	const playLabel = usePlayLabel();
	const progress = usePlayerState((s) =>
		s.book && s.book.duration > 0 ? s.time / s.book.duration : 0,
	);
	const toggle = (on: boolean) => (on ? palette.accent : palette.text);

	return (
		<View
			style={{
				backgroundColor: palette.chrome,
				paddingBottom: insets.bottom,
				paddingLeft: insets.left,
				paddingRight: insets.right,
			}}
		>
			<View style={{ height: 2, backgroundColor: palette.separator }}>
				<View
					style={{
						height: 2,
						width: `${Math.min(100, progress * 100)}%`,
						backgroundColor: palette.accent,
					}}
				/>
			</View>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("audiobook.player_expand")}
				onPress={() => router.push("/player")}
				style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}
			>
				<Text variant="caption" tone="secondary" numberOfLines={1}>
					{bar.statusText}
				</Text>
			</Pressable>
			<View
				accessibilityLabel={t("read_listen.controls_label")}
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "space-between",
					paddingHorizontal: space.sm,
				}}
			>
				<TransportButton
					icon={icons.followText}
					label={
						bar.followText
							? t("read_listen.follow_text")
							: t("read_listen.return_to_narration")
					}
					accessibilityState={{ selected: bar.followText }}
					color={toggle(bar.followText)}
					size={20}
					onPress={() => onCommand("toggle-follow")}
				/>
				<TransportButton
					icon={icons.seekFromText}
					label={t("read_listen.seek_from_text")}
					accessibilityState={{ selected: bar.seekFromText }}
					color={toggle(bar.seekFromText)}
					size={20}
					onPress={() => onCommand("toggle-seek")}
				/>
				<TransportButton
					icon={icons.jumpBack}
					label={t("audiobook.player_back_seconds", { seconds: 10 })}
					color={palette.text}
					onPress={player.back}
				/>
				<TransportButton
					icon={icons.play}
					label={playLabel}
					color={palette.text}
					box={52}
					onPress={player.toggle}
				>
					<PlayPauseGlyph size={30} color={palette.text} />
				</TransportButton>
				<TransportButton
					icon={icons.jumpForward}
					label={t("audiobook.player_forward_seconds", { seconds: 30 })}
					color={palette.text}
					onPress={player.forward}
				/>
				<TransportButton
					icon={icons.readListen}
					label={t("read_listen.disable_reader")}
					accessibilityState={{ selected: true }}
					color={palette.accent}
					size={20}
					onPress={() => onCommand("exit")}
				/>
			</View>
		</View>
	);
}
