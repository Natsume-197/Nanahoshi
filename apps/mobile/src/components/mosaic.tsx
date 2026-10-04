import { View } from "react-native";
import { usePalette } from "@/theme";
import { Cover } from "./cover";
import { Icon, type IconName, icons } from "./icon";

/**
 * The web's CollectionArtwork: up to four distinct covers in a square with a
 * 1px border-coloured seam. One fills the square, two split it into columns,
 * three give the first cover the full left column, four make a 2×2.
 */
export function Mosaic({
	covers,
	size,
	fallbackIcon = icons.folder,
	rounded,
}: {
	covers: string[];
	size: number;
	fallbackIcon?: IconName;
	/** Corner radius; defaults to the theme's cover radius. */
	rounded?: number;
}) {
	const palette = usePalette();
	const unique = Array.from(new Set(covers.filter(Boolean))).slice(0, 4);
	const frame = {
		width: size,
		height: size,
		borderRadius: rounded ?? palette.coverRadius,
		borderCurve: "continuous" as const,
		overflow: "hidden" as const,
		backgroundColor: palette.surface,
	};

	if (unique.length === 0) {
		return (
			<View style={[frame, { alignItems: "center", justifyContent: "center" }]}>
				<Icon
					name={fallbackIcon}
					size={size * 0.3}
					color={palette.textTertiary}
				/>
			</View>
		);
	}
	if (unique.length === 1) {
		return (
			<View style={frame}>
				<Cover cover={unique[0]} width={size} shape="audio" rounded={0} />
			</View>
		);
	}

	const half = (size - 1) / 2;
	const cell = (cover: string, width: number, height: number) => (
		<View key={cover} style={{ width, height, overflow: "hidden" }}>
			<Cover
				cover={cover}
				width={Math.max(width, height)}
				shape="audio"
				rounded={0}
			/>
		</View>
	);

	return (
		<View
			style={[
				frame,
				{ flexDirection: "row", gap: 1, backgroundColor: palette.separator },
			]}
		>
			{unique.length === 2 ? (
				<>
					{cell(unique[0], half, size)}
					{cell(unique[1], half, size)}
				</>
			) : (
				<>
					{unique.length === 3 ? (
						cell(unique[0], half, size)
					) : (
						<View style={{ gap: 1 }}>
							{cell(unique[0], half, half)}
							{cell(unique[3], half, half)}
						</View>
					)}
					<View style={{ gap: 1 }}>
						{cell(unique[1], half, half)}
						{cell(unique[2], half, half)}
					</View>
				</>
			)}
		</View>
	);
}
