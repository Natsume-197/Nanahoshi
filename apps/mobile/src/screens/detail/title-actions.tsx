import { router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { openAddToList } from "@/components/add-to-list/open";
import { Icon, type IconName, icons } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { Text } from "@/components/text";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { usePlayer, usePlayerState } from "@/player/provider";
import { useReadListenEntry } from "@/reader/read-listen-entry";
import { radius, space, usePalette } from "@/theme";
import { primaryAction } from "./detail-model";
import { useShelfStatus } from "./use-shelf-status";

const HEIGHT = 44;

/**
 * Fable's stacked actions: read/listen filled, the shelf outlined under it
 * at the same width. Download and the rest live in the page's header.
 */
export function TitleActions({
	uuid,
	kind,
	progress,
	duration,
	position,
}: {
	uuid: string;
	kind: "ebook" | "audiobook";
	/** 0–100. */
	progress: number;
	/** Audiobooks: length and saved position, in seconds. */
	duration?: number | null;
	position?: number | null;
}) {
	const player = usePlayer();
	const shelf = useShelfStatus(uuid, kind);
	const readListen = useReadListenEntry(uuid, kind);
	const audio = kind === "audiobook";
	// This book is the one in the player: the button becomes play/pause.
	const current = usePlayerState((s) => s.book?.uuid === uuid);
	const playing = usePlayerState((s) => s.book?.uuid === uuid && s.playing);
	const loading = usePlayerState((s) => s.loadingUuid === uuid);
	const { label, detail } = primaryAction({
		audio,
		progress,
		playing,
		duration,
		position,
	});

	return (
		<View style={{ gap: space.sm }}>
			<ActionButton
				filled
				label={label}
				detail={detail}
				loading={loading}
				icon={playing ? icons.pause : audio ? icons.play : icons.book}
				onPress={() => {
					// Audiobooks play right away and the mini player takes over
					// from here (like the web); ebooks open the reader.
					if (!audio)
						return router.push({
							pathname: "/reader/[uuid]",
							params: { uuid },
						});
					haptics.tap();
					if (current) player.toggle();
					else void player.play(uuid);
				}}
			/>
			<ActionButton
				label={shelf.label ?? t("add_to_list.title")}
				icon={shelf.icon ?? icons.plus}
				trailing={icons.collapse}
				onPress={() => openAddToList({ uuid, kind })}
			/>
			{readListen ? (
				<ActionButton
					label={t("read_listen.open_reader")}
					icon={icons.readListen}
					onPress={readListen}
				/>
			) : null}
		</View>
	);
}

function ActionButton({
	label,
	detail,
	icon,
	iconColor,
	trailing,
	filled = false,
	loading = false,
	onPress,
}: {
	label: string;
	detail?: string | null;
	icon: IconName;
	iconColor?: string;
	trailing?: IconName;
	filled?: boolean;
	loading?: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	const ink = filled ? palette.onPrimary : palette.text;
	return (
		<PressableScale
			onPress={onPress}
			disabled={loading}
			accessibilityRole="button"
			accessibilityLabel={detail ? `${label}, ${detail}` : label}
			accessibilityState={{ busy: loading }}
			style={{
				height: HEIGHT,
				borderRadius: radius.field,
				borderCurve: "continuous",
				backgroundColor: filled ? palette.primary : "transparent",
				borderWidth: filled ? 0 : 1,
				borderColor: palette.text,
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "center",
				gap: space.sm,
				paddingHorizontal: space.lg,
			}}
		>
			{loading ? (
				<ActivityIndicator color={ink} />
			) : (
				<>
					<Icon name={icon} size={16} color={iconColor ?? ink} />
					<Text
						variant="label"
						numberOfLines={1}
						style={{ color: ink, fontWeight: "600", flexShrink: 1 }}
					>
						{label}
					</Text>
					{detail ? (
						<Text
							variant="label"
							numberOfLines={1}
							style={{
								color: ink,
								opacity: 0.7,
								fontVariant: ["tabular-nums"],
							}}
						>
							{`· ${detail}`}
						</Text>
					) : null}
					{trailing ? (
						<View
							style={{
								position: "absolute",
								right: space.lg,
							}}
						>
							<Icon name={trailing} size={16} color={palette.textSecondary} />
						</View>
					) : null}
				</>
			)}
		</PressableScale>
	);
}
