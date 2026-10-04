import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { space } from "@/theme";
import { Text } from "./text";

/** A titled block of a page: heading, optional line under it, then its
 * content `gap` apart. */
export function Section({
	title,
	description,
	gap = space.md,
	style,
	children,
}: {
	title: string;
	description?: string;
	gap?: number;
	style?: StyleProp<ViewStyle>;
	children: ReactNode;
}) {
	return (
		<View style={[{ gap: space.md }, style]}>
			<View style={{ gap: space.xs }}>
				<Text variant="section" accessibilityRole="header">
					{title}
				</Text>
				{description ? (
					<Text variant="subhead" tone="secondary">
						{description}
					</Text>
				) : null}
			</View>
			<View style={{ gap }}>{children}</View>
		</View>
	);
}
