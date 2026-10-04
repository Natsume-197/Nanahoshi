import { RNHostView } from "@expo/ui";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sheet } from "@/components/sheet";
import { space } from "@/theme";
import type { PlayerBook } from "./engine";
import { useSheetInk } from "./ink";
import { BookmarksPanel, ChaptersPanel } from "./player-panels";

export type ListTab = "chapters" | "bookmarks";

/** Chapters or bookmarks, one list per button, in the system sheet. */
export function PlayerListSheet({
	book,
	tab,
	onClose,
}: {
	book: PlayerBook;
	tab: ListTab | null;
	onClose: () => void;
}) {
	const tone = useSheetInk();
	const insets = useSafeAreaInsets();
	const { width, height } = useWindowDimensions();
	const hasChapters = book.chapters.length > 0;
	return (
		<Sheet open={tab !== null} color={tone.sheet} onClose={onClose}>
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
					{tab === "chapters" && hasChapters ? (
						<ChaptersPanel book={book} />
					) : tab ? (
						<BookmarksPanel book={book} />
					) : null}
				</View>
			</RNHostView>
		</Sheet>
	);
}
