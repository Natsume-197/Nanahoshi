import { router } from "expo-router";
import { View } from "react-native";
import { titleOrUntitled } from "@/lib/format";
import { type MediaKind, routes } from "@/lib/routes";
import { usePrefetchTitle } from "@/lib/title-queries";
import { usePalette } from "@/theme";
import { BookMenuTarget } from "./book-menu";
import { Cover } from "./cover";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";

export type TileItem = {
	uuid: string;
	title: string | null;
	cover: string | null;
	color?: string | null;
	kind: MediaKind;
	subtitle?: string | null;
	/** 0–100; drawn as the web's hairline along the cover's bottom edge. */
	progress?: number;
	/** From a recommendation feed: its actions offer "Not interested". */
	recommendation?: boolean;
};

/**
 * The web's vertical BookCardShell: cover on top, a two-line 16pt title and a
 * muted one-line author beneath, 12pt apart. `frame` decides the cover box:
 * "book" (2:3) for mixed or book rows — square audiobook art then sits
 * centred on a plate of its own colour — or "square" when a whole row is
 * audiobooks.
 */
export function TitleTile({
	item,
	width,
	frame = "book",
}: {
	item: TileItem;
	width: number;
	frame?: "book" | "square";
}) {
	const palette = usePalette();
	const prefetch = usePrefetchTitle();
	const square = item.kind === "audiobook";
	const frameHeight = frame === "square" ? width : Math.round(width * 1.5);
	const plated = square && frame === "book";

	return (
		<BookMenuTarget
			target={{
				uuid: item.uuid,
				kind: item.kind,
				title: item.title,
				cover: item.cover,
				color: item.color,
				subtitle: item.subtitle,
				recommendation: item.recommendation,
			}}
			style={{ width }}
		>
			{(onLongPress) => (
				<PressableScale
					onPressIn={() => prefetch(item.kind, item.uuid, item.cover)}
					onPress={() => router.push(routes.title(item.kind, item.uuid))}
					onLongPress={onLongPress}
					accessibilityRole="button"
					accessibilityLabel={[titleOrUntitled(item.title), item.subtitle]
						.filter(Boolean)
						.join(", ")}
					style={{ width, gap: 12 }}
				>
					<View
						style={{
							width,
							height: frameHeight,
							borderRadius: palette.coverRadius,
							overflow: "hidden",
							justifyContent: "center",
							backgroundColor: plated
								? platedBackground(item.color, palette.surface)
								: undefined,
						}}
					>
						<Cover
							cover={item.cover}
							color={item.color}
							width={width}
							shape={square ? "audio" : "book"}
							recyclingKey={item.uuid}
						/>
						{item.progress && item.progress > 0 ? (
							<View
								style={{
									position: "absolute",
									left: 0,
									right: 0,
									bottom: 0,
									height: 4,
									backgroundColor: palette.progressTrack,
								}}
							>
								<View
									style={{
										width: `${item.progress}%`,
										height: "100%",
										backgroundColor: palette.progress,
									}}
								/>
							</View>
						) : null}
					</View>
					<View style={{ gap: 4, paddingHorizontal: 2, minHeight: 64 }}>
						<Text numberOfLines={2} variant="tileTitle">
							{titleOrUntitled(item.title)}
						</Text>
						{item.subtitle ? (
							<Text
								variant="subhead"
								tone="secondary"
								numberOfLines={1}
								style={{ lineHeight: 22 }}
							>
								{item.subtitle}
							</Text>
						) : null}
					</View>
				</PressableScale>
			)}
		</BookMenuTarget>
	);
}

/** color-mix(in oklab, tint 22%, var(--muted)) approximated in sRGB. */
function platedBackground(tint: string | null | undefined, muted: string) {
	const parse = (hex: string) => {
		const match = /^#?([\da-f]{6})$/i.exec(hex.trim());
		if (!match) return null;
		const value = Number.parseInt(match[1], 16);
		return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
	};
	const a = tint ? parse(tint) : null;
	const b = parse(muted);
	if (!a || !b) return muted;
	const [r, g, bl] = a.map((channel, index) =>
		Math.round(channel * 0.22 + b[index] * 0.78),
	);
	return `rgb(${r}, ${g}, ${bl})`;
}
