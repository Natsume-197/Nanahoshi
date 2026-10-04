import {
	Box,
	Column,
	IconButton,
	LazyColumn,
	Row,
	SegmentedButton,
	SingleChoiceSegmentedButtonRow,
	Text,
	TextField,
	useNativeState,
} from "@expo/ui/jetpack-compose";
import {
	fillMaxWidth,
	padding,
	size,
	weight,
} from "@expo/ui/jetpack-compose/modifiers";
import { useRef, useState } from "react";
import { MaterialIcon } from "@/components/action-menu/material-icon";
import { icons } from "@/components/icon";
import { Sheet } from "@/components/sheet";
import { SheetMeta, SheetRow, SheetTitle } from "@/components/sheet/rows";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { type AudioBookmark, useBookmarks } from "./bookmarks";
import { bookmarkLines } from "./bookmarks-model";
import { chapterName, chapterNameAt } from "./chapter-name";
import type { PlayerBook } from "./engine";
import { useSheetInk } from "./ink";
import { usePlayer, usePlayerState } from "./provider";
import { useTimeScope } from "./time-scope";
import { activeChapterIndex, clock, clockIn } from "./timing";

export type ListTab = "chapters" | "bookmarks";

const playing = { ios: "waveform", android: "graphic_eq" } as const;
const earlier = { ios: "chevron.up", android: "expand_less" } as const;
const addBookmark = { ios: "bookmark", android: "bookmark_add" } as const;

/**
 * Chapters and bookmarks in the Material sheet the rest of the app uses,
 * over the player instead of in the artwork's place: the list scrolls,
 * drags up to full height and swipes away like any other sheet.
 */
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
	if (!tab) return null;
	return <ListSheet book={book} tab={tab} onTab={onTab} onClose={onClose} />;
}

function ListSheet({
	book,
	tab,
	onTab,
	onClose,
}: {
	book: PlayerBook;
	tab: ListTab;
	onTab: (tab: ListTab) => void;
	onClose: () => void;
}) {
	const tone = useSheetInk();
	const bookmarks = useBookmarks(book.uuid);
	const hasChapters = book.chapters.length > 0;
	return (
		<Sheet color={tone.sheet} onClose={onClose}>
			{(dismiss) => {
				// A jump closes the sheet: the listener wants to hear the moment picked.
				const jumpAndClose = (jump: () => void) => {
					haptics.select();
					jump();
					dismiss();
				};
				return (
					<Column modifiers={[fillMaxWidth()]}>
						{hasChapters ? (
							<SingleChoiceSegmentedButtonRow
								modifiers={[fillMaxWidth(), padding(16, 0, 16, 12)]}
							>
								<TabButton
									label={t("audiobook.player_chapters")}
									selected={tab === "chapters"}
									onPress={() => onTab("chapters")}
								/>
								<TabButton
									label={
										bookmarks.list.length > 0
											? `${t("audiobook.player_bookmarks")} · ${bookmarks.list.length}`
											: t("audiobook.player_bookmarks")
									}
									selected={tab === "bookmarks"}
									onPress={() => onTab("bookmarks")}
								/>
							</SingleChoiceSegmentedButtonRow>
						) : (
							<SheetTitle>{t("audiobook.player_bookmarks")}</SheetTitle>
						)}
						{tab === "chapters" && hasChapters ? (
							<ChapterList book={book} onJump={jumpAndClose} />
						) : (
							<BookmarkList book={book} onJump={jumpAndClose} />
						)}
					</Column>
				);
			}}
		</Sheet>
	);
}

function TabButton({
	label,
	selected,
	onPress,
}: {
	label: string;
	selected: boolean;
	onPress: () => void;
}) {
	const tone = useSheetInk();
	return (
		<SegmentedButton
			selected={selected}
			onClick={() => {
				haptics.select();
				onPress();
			}}
			colors={{
				activeContainerColor: tone.text,
				activeContentColor: tone.onText,
				activeBorderColor: tone.text,
				inactiveContainerColor: "transparent",
				inactiveContentColor: tone.text,
				inactiveBorderColor: tone.track,
			}}
		>
			<SegmentedButton.Label>
				<Text color={selected ? tone.onText : tone.text}>{label}</Text>
			</SegmentedButton.Label>
		</SegmentedButton>
	);
}

/**
 * Starts one chapter above the playing one, since the list can't be scrolled
 * to it: the chapters before fold into a row that brings them back.
 */
function ChapterList({
	book,
	onJump,
}: {
	book: PlayerBook;
	onJump: (jump: () => void) => void;
}) {
	const tone = useSheetInk();
	const player = usePlayer();
	const current = usePlayerState((s) =>
		activeChapterIndex(book.chapters, s.time),
	);
	const [from, setFrom] = useState(() => Math.max(0, current - 1));
	const shown = book.chapters.slice(from);
	return (
		<LazyColumn contentPadding={{ bottom: 24 }} modifiers={[fillMaxWidth()]}>
			{from > 0 ? (
				<SheetRow
					icon={earlier}
					iconTint={tone.muted}
					title={t("mobile.player.earlier_chapters", { count: from })}
					titleColor={tone.muted}
					onPress={() => setFrom(0)}
				/>
			) : null}
			{shown.map((chapter, offset) => {
				const index = from + offset;
				const active = index === current;
				return (
					<SheetRow
						key={chapter.index}
						background={active ? tone.chip : tone.sheet}
						leading={
							// Fixed box: the icon and the numbers keep the titles aligned.
							<Box contentAlignment="center" modifiers={[size(24, 24)]}>
								{active ? (
									<MaterialIcon name={playing} tint={tone.text} />
								) : (
									<Text color={tone.faint} style={{ typography: "labelLarge" }}>
										{String(index + 1)}
									</Text>
								)}
							</Box>
						}
						title={chapterName(chapter, index)}
						titleColor={
							active ? tone.text : index < current ? tone.muted : tone.soft
						}
						bold={active}
						singleLine
						trailing={
							<SheetMeta>
								{clock(chapter.endTime - chapter.startTime)}
							</SheetMeta>
						}
						onPress={() =>
							onJump(() => void player.seek(chapter.startTime, true))
						}
					/>
				);
			})}
		</LazyColumn>
	);
}

function BookmarkList({
	book,
	onJump,
}: {
	book: PlayerBook;
	onJump: (jump: () => void) => void;
}) {
	const tone = useSheetInk();
	const player = usePlayer();
	const time = usePlayerState((s) => Math.floor(s.time));
	const bookmarks = useBookmarks(book.uuid);
	const [editing, setEditing] = useState<string | null>(null);
	const scope = useTimeScope();
	const at = (seconds: number) => clockIn(book.chapters, seconds, scope);
	const chapterAt = (at: number) => chapterNameAt(book.chapters, at);
	return (
		<LazyColumn contentPadding={{ bottom: 24 }} modifiers={[fillMaxWidth()]}>
			<SheetRow
				icon={addBookmark}
				iconTint={tone.text}
				title={t("audiobook.player_bookmark_add")}
				trailing={<SheetMeta>{at(time)}</SheetMeta>}
				onPress={() => {
					haptics.release();
					bookmarks.add(time);
				}}
			/>
			{bookmarks.list.length === 0 ? (
				<Text
					color={tone.muted}
					style={{ typography: "bodyMedium", textAlign: "center" }}
					modifiers={[fillMaxWidth(), padding(32, 24, 32, 24)]}
				>
					{t("audiobook.player_bookmarks_empty")}
				</Text>
			) : null}
			{bookmarks.list.map((bookmark) =>
				editing === bookmark.id ? (
					<LabelEditor
						key={bookmark.id}
						bookmark={bookmark}
						time={at(bookmark.time)}
						placeholder={chapterAt(bookmark.time)}
						onSave={(label) => {
							bookmarks.rename(bookmark.id, label);
							setEditing(null);
						}}
					/>
				) : (
					<BookmarkRow
						key={bookmark.id}
						bookmark={bookmark}
						time={at(bookmark.time)}
						chapter={chapterAt(bookmark.time)}
						onSeek={() => onJump(() => void player.seek(bookmark.time, true))}
						onEdit={() => setEditing(bookmark.id)}
						onRemove={() => {
							haptics.tap();
							bookmarks.remove(bookmark.id);
						}}
					/>
				),
			)}
		</LazyColumn>
	);
}

function BookmarkRow({
	bookmark,
	time,
	chapter,
	onSeek,
	onEdit,
	onRemove,
}: {
	bookmark: AudioBookmark;
	time: string;
	chapter: string | null;
	onSeek: () => void;
	onEdit: () => void;
	onRemove: () => void;
}) {
	const tone = useSheetInk();
	const lines = bookmarkLines(bookmark, chapter, time);
	return (
		<SheetRow
			icon={icons.bookmark}
			iconTint={tone.soft}
			title={lines.title}
			subtitle={[time, lines.chapter].filter(Boolean).join(" · ")}
			singleLine
			trailing={
				<Row verticalAlignment="center">
					<IconButton onClick={onEdit}>
						<MaterialIcon name={icons.edit} tint={tone.muted} size={20} />
					</IconButton>
					<IconButton onClick={onRemove}>
						<MaterialIcon name={icons.trash} tint={tone.muted} size={20} />
					</IconButton>
				</Row>
			}
			onPress={onSeek}
		/>
	);
}

function LabelEditor({
	bookmark,
	time,
	placeholder,
	onSave,
}: {
	bookmark: AudioBookmark;
	time: string;
	placeholder: string | null;
	onSave: (label: string) => void;
}) {
	const tone = useSheetInk();
	const value = useNativeState(bookmark.label);
	const draft = useRef(bookmark.label);
	return (
		<Row
			verticalAlignment="center"
			modifiers={[fillMaxWidth(), padding(16, 4, 4, 4)]}
		>
			<TextField
				value={value}
				autoFocus
				singleLine
				maxLength={140}
				onValueChange={(text) => {
					draft.current = text;
				}}
				keyboardOptions={{ imeAction: "done", capitalization: "sentences" }}
				keyboardActions={{ onDone: onSave }}
				colors={{
					focusedContainerColor: tone.chip,
					unfocusedContainerColor: tone.chip,
					focusedTextColor: tone.text,
					unfocusedTextColor: tone.text,
					cursorColor: tone.text,
					focusedIndicatorColor: tone.text,
					unfocusedIndicatorColor: tone.track,
					focusedPlaceholderColor: tone.faint,
					unfocusedPlaceholderColor: tone.faint,
					focusedLabelColor: tone.muted,
					unfocusedLabelColor: tone.muted,
				}}
				modifiers={[weight(1)]}
			>
				<TextField.Label>
					<Text>{time}</Text>
				</TextField.Label>
				<TextField.Placeholder>
					<Text>
						{placeholder ?? t("audiobook.player_bookmark_label_placeholder")}
					</Text>
				</TextField.Placeholder>
			</TextField>
			<IconButton onClick={() => onSave(draft.current)}>
				<MaterialIcon name={icons.check} tint={tone.text} />
			</IconButton>
		</Row>
	);
}
