import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { space } from "@/theme";
import { useFormSheet } from "./form-sheet/open";
import { Text } from "./text";

const PADDING = {
	padding: space.lg,
	paddingTop: space.xl,
	gap: space.lg,
	paddingBottom: space.xxl,
};

/** The sheet's content, as "Add to list" lays it out: a scroll view filling
 * the sheet, so it never shrinks when the keyboard goes away. In the Material
 * sheet it is plain content, which the sheet sizes itself to. */
export function SheetBody({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	const { embedded } = useFormSheet();
	const content = (
		<>
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
		</>
	);
	// The sheet's grabber already spaces the title from the top edge.
	if (embedded)
		return <View style={[PADDING, { paddingTop: space.xs }]}>{content}</View>;
	return (
		<ScrollView
			keyboardShouldPersistTaps="handled"
			automaticallyAdjustKeyboardInsets
			contentContainerStyle={PADDING}
		>
			{content}
		</ScrollView>
	);
}
