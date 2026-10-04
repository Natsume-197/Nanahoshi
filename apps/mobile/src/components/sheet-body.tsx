import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { space } from "@/theme";
import { Text } from "./text";

/** The sheet's content, as "Add to list" lays it out: a scroll view filling
 * the sheet, so it never shrinks when the keyboard goes away. */
export function SheetBody({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<ScrollView
			keyboardShouldPersistTaps="handled"
			automaticallyAdjustKeyboardInsets
			contentContainerStyle={{
				padding: space.lg,
				paddingTop: space.xl,
				gap: space.lg,
				paddingBottom: space.xxl,
			}}
		>
			<View style={{ gap: space.xs, marginBottom: space.sm }}>
				<Text variant="title" accessibilityRole="header">
					{title}
				</Text>
				{description ? (
					<Text variant="subhead" tone="secondary">
						{description}
					</Text>
				) : null}
			</View>
			{children}
		</ScrollView>
	);
}
