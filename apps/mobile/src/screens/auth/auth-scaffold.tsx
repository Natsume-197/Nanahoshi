import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/text";
import { space } from "@/theme";

/** The web's auth page: vertically centred column, 36pt bold two-line
 * heading, 16pt muted lead, 16pt gutters. */
export function AuthScaffold({
	title,
	lead,
	children,
}: {
	title: string;
	lead?: string;
	children: ReactNode;
}) {
	return (
		<ScrollView
			contentInsetAdjustmentBehavior="automatic"
			keyboardShouldPersistTaps="handled"
			automaticallyAdjustKeyboardInsets
			contentContainerStyle={{
				flexGrow: 1,
				justifyContent: "center",
				paddingHorizontal: space.lg,
				paddingVertical: space.xxl,
				gap: space.xxl,
			}}
		>
			<View style={{ gap: space.sm }}>
				<Text accessibilityRole="header" variant="display">
					{title}
				</Text>
				{lead ? (
					<Text tone="secondary" selectable variant="lead">
						{lead}
					</Text>
				) : null}
			</View>
			{children}
		</ScrollView>
	);
}
