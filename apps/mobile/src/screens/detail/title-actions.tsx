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
import { space, usePalette } from "@/theme";
import { primaryAction } from "./detail-model";
import { useShelfStatus } from "./use-shelf-status";

const HEIGHT = 48;

/**
 * The web's two rows: read/listen as a filled pill (Read & Listen, when
 * there is one, takes half the row), then the shelf as a labelled tonal pill so the list the title
 * is in always reads. Download and the rest live in the page's header.
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
			<View style={{ flexDirection: "row", gap: space.sm }}>
				<PrimaryButton
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
				{readListen ? (
					<PrimaryButton
						label={t("read_listen.open_reader")}
						icon={icons.readListen}
						onPress={readListen}
					/>
				) : null}
			</View>
			<ShelfButton
				label={shelf.label ?? t("add_to_list.title")}
				icon={shelf.icon ?? icons.plus}
				active={!!shelf.bucket}
				onPress={() => openAddToList({ uuid, kind })}
			/>
		</View>
	);
}

function PrimaryButton({
	label,
	detail,
	icon,
	loading = false,
	onPress,
}: {
	label: string;
	detail?: string | null;
	icon: IconName;
	loading?: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	// Inverse of the page, not the lavender: black on #8b7a9e read muddy.
	const ink = palette.background;
	return (
		// PressableScale styles its inner view; the wrapper takes the row's slack.
		<View style={{ flex: 1 }}>
			<PressableScale
				onPress={onPress}
				disabled={loading}
				accessibilityRole="button"
				accessibilityLabel={detail ? `${label}, ${detail}` : label}
				accessibilityState={{ busy: loading }}
				style={{
					height: HEIGHT,
					borderRadius: HEIGHT / 2,
					backgroundColor: palette.text,
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "center",
					gap: space.sm,
					paddingHorizontal: space.md,
				}}
			>
				{loading ? (
					<ActivityIndicator color={ink} />
				) : (
					<>
						<Icon name={icon} size={20} color={ink} />
						<Text
							variant="headline"
							numberOfLines={1}
							style={{ color: ink, fontWeight: "600", flexShrink: 1 }}
						>
							{label}
						</Text>
						{detail ? (
							<Text
								variant="headline"
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
					</>
				)}
			</PressableScale>
		</View>
	);
}

/** A set shelf sits on the soft accent, so "in a list" reads at a glance;
 * the text stays full ink for contrast. */
function ShelfButton({
	label,
	icon,
	active,
	onPress,
}: {
	label: string;
	icon: IconName;
	active: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	const ink = palette.text;
	return (
		<PressableScale
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ selected: active }}
			style={{
				height: HEIGHT,
				borderRadius: HEIGHT / 2,
				backgroundColor: active ? palette.accentSoft : palette.surface,
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "center",
				gap: space.sm,
				paddingHorizontal: space.lg,
			}}
		>
			<Icon name={icon} size={20} color={ink} />
			<Text
				variant="headline"
				numberOfLines={1}
				style={{ color: ink, fontWeight: "600", flexShrink: 1 }}
			>
				{label}
			</Text>
		</PressableScale>
	);
}
