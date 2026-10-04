import { BottomSheet, RNHostView } from "@expo/ui";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/text";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { radius, space } from "@/theme";
import type { PlayerBook } from "./engine";
import { useSheetInk } from "./ink";
import { BookmarksPanel, ChaptersPanel } from "./player-panels";

export type ListTab = "chapters" | "bookmarks";

/** Chapters and bookmarks in the system sheet, over the player. */
export function PlayerListSheet({
	book,
	tab,
	onTab,
	onClose,
}: {
	book: PlayerBook;
	tab: ListTab | null;
	onTab: (tab: ListTab) => void;
	onClose: () => void;
}) {
	const tone = useSheetInk();
	const insets = useSafeAreaInsets();
	const { width, height } = useWindowDimensions();
	const hasChapters = book.chapters.length > 0;
	return (
		<BottomSheet
			isPresented={tab !== null}
			onDismiss={onClose}
			containerColor={tone.sheet}
			contentPadding={0}
		>
			<RNHostView matchContents>
				<View
					style={{
						width,
						height: height * 0.6,
						paddingTop: space.md,
						paddingHorizontal: space.lg,
						paddingBottom: insets.bottom,
						gap: space.md,
					}}
				>
					{hasChapters ? (
						<View
							style={{
								flexDirection: "row",
								padding: 2,
								borderRadius: radius.pill,
								backgroundColor: tone.chip,
							}}
						>
							{(["chapters", "bookmarks"] as const).map((item) => (
								<Pressable
									key={item}
									onPress={() => {
										haptics.select();
										onTab(item);
									}}
									accessibilityRole="tab"
									accessibilityState={{ selected: tab === item }}
									style={{
										flex: 1,
										height: 32,
										borderRadius: radius.pill,
										alignItems: "center",
										justifyContent: "center",
										backgroundColor: tab === item ? tone.text : "transparent",
									}}
								>
									<Text
										variant="label"
										style={{ color: tab === item ? tone.onText : tone.text }}
									>
										{t(
											item === "chapters"
												? "audiobook.player_chapters"
												: "audiobook.player_bookmarks",
										)}
									</Text>
								</Pressable>
							))}
						</View>
					) : null}
					{tab === "chapters" && hasChapters ? (
						<ChaptersPanel book={book} />
					) : tab ? (
						<BookmarksPanel book={book} />
					) : null}
				</View>
			</RNHostView>
		</BottomSheet>
	);
}
