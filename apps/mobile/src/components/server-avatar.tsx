import { Image } from "expo-image";
import { View } from "react-native";
import { usePalette } from "@/theme";
import { Text } from "./text";

/** A server's logo, or its initials on the primary color when it has none. */
export function ServerAvatar({
	name,
	logo,
	size = 28,
}: {
	name: string;
	logo: string | null;
	size?: number;
}) {
	const palette = usePalette();
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size * 0.29,
				borderCurve: "continuous",
				overflow: "hidden",
				backgroundColor: palette.primary,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{logo ? (
				<Image
					source={{ uri: logo }}
					cachePolicy="memory-disk"
					contentFit="cover"
					style={{ width: size, height: size }}
				/>
			) : (
				<Text
					style={{
						fontSize: size * 0.43,
						fontWeight: "600",
						color: palette.onPrimary,
					}}
				>
					{initials(name)}
				</Text>
			)}
		</View>
	);
}

function initials(name: string) {
	return name
		.split(/[\s-_]+/)
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}
