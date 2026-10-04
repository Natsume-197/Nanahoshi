import { type Href, Link } from "expo-router";
import { View } from "react-native";
import { shadows, usePalette } from "@/theme";
import { Mosaic } from "./mosaic";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";

/** The web's CollectionCard for home rails: square mosaic, two-line name,
 * muted count. */
export function CollectionCard({
	href,
	name,
	covers,
	subtitle,
	width,
}: {
	href: Href;
	name: string;
	covers: string[];
	subtitle: string;
	width: number;
}) {
	const palette = usePalette();
	return (
		<Link href={href} asChild>
			<PressableScale
				accessibilityRole="button"
				accessibilityLabel={name}
				style={{ width, gap: 12 }}
			>
				<View
					style={{ boxShadow: shadows.card, borderRadius: palette.coverRadius }}
				>
					<Mosaic covers={covers} size={width} />
				</View>
				<View style={{ gap: 4, minHeight: 64, paddingHorizontal: 2 }}>
					<Text variant="tileTitle" numberOfLines={2}>
						{name}
					</Text>
					<Text variant="subhead" tone="secondary" numberOfLines={1}>
						{subtitle}
					</Text>
				</View>
			</PressableScale>
		</Link>
	);
}
