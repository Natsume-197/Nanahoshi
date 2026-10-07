import { Image } from "expo-image";
import { View } from "react-native";
import { coverUrl } from "@/lib/covers";
import { useConnection } from "@/providers/app-provider";
import { COVER_ASPECT, usePalette } from "@/theme";
import { Icon, icons } from "./icon";

/** 2:3 for books, 1:1 for audiobooks — the shapes every reference app uses. */
export type CoverShape = "book" | "audio";

export function Cover({
	cover,
	color,
	width,
	shape = "book",
	rounded,
	recyclingKey,
	localUri,
}: {
	cover: string | null | undefined;
	/** A copy on the device (downloads), preferred over the server's. */
	localUri?: string | null;
	color?: string | null;
	width: number;
	shape?: CoverShape;
	rounded?: number;
	recyclingKey?: string;
}) {
	const palette = usePalette();
	const { serverUrl } = useConnection();
	const corner = rounded ?? palette.coverRadius;
	const height = shape === "audio" ? width : Math.round(width * COVER_ASPECT);
	const uri = localUri ?? coverUrl(serverUrl, cover, width);

	return (
		<View
			style={{
				width,
				height,
				borderRadius: corner,
				borderCurve: "continuous",
				overflow: "hidden",
				backgroundColor: color ?? palette.skeleton,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{uri ? (
				<Image
					source={{ uri }}
					recyclingKey={recyclingKey}
					// Android's default ("disk") skips Glide's memory cache, so every
					// tile scrolled back into view decoded and faded in again.
					cachePolicy="memory-disk"
					contentFit="cover"
					transition={150}
					style={{ width: "100%", height: "100%" }}
				/>
			) : (
				<Icon
					name={shape === "audio" ? icons.headphones : icons.book}
					size={Math.max(16, width / 4)}
					color={palette.textTertiary}
				/>
			)}
			{/* Hairline so pale covers don't dissolve into the canvas. */}
			<View
				pointerEvents="none"
				style={{
					position: "absolute",
					inset: 0,
					borderRadius: corner,
					borderCurve: "continuous",
					borderWidth: 1,
					borderColor: palette.coverEdge,
				}}
			/>
		</View>
	);
}
