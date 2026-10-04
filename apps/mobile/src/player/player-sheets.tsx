import { RNHostView } from "@expo/ui";
import type { ReactNode } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { Toggle } from "@/components/toggle";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { radius, space } from "@/theme";
import { TransportButton } from "./controls";
import type { PlayerBook } from "./engine";
import { ink, useSheetInk } from "./ink";
import { usePlayer, usePlayerState } from "./provider";
import { SheetFrame } from "./sheet-frame";
import {
	clock,
	formatSpeed,
	JUMP_AMOUNTS,
	type JumpAmount,
	MAX_SPEED,
	MIN_SPEED,
	nudgeSpeed,
	SLEEP_MINUTES,
	type SleepMode,
	SPEED_PRESETS,
} from "./timing";

export type Sheet = "speed" | "sleep";

/** Speed and sleep open over the player as the platform's own sheet. */
export function PlayerSheets({
	book,
	sheet,
	onClose,
}: {
	book: PlayerBook;
	sheet: Sheet | null;
	onClose: () => void;
}) {
	const tone = useSheetInk();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	return (
		<SheetFrame open={sheet !== null} color={tone.sheet} onClose={onClose}>
			{/* Hosted, not bare: RN views set straight into the Compose sheet
			    drew but never received a press. */}
			{(close) => (
				<RNHostView matchContents>
					<View
						style={{
							width,
							paddingHorizontal: space.lg,
							paddingBottom: insets.bottom + space.lg,
							gap: space.lg,
						}}
					>
						{sheet === "speed" ? <PlaybackSheet /> : null}
						{sheet === "sleep" ? (
							<SleepSheet book={book} onDone={close} />
						) : null}
					</View>
				</RNHostView>
			)}
		</SheetFrame>
	);
}

function SheetTitle({
	children,
	trailing,
}: {
	children: string;
	trailing?: string;
}) {
	const tone = useSheetInk();
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "baseline",
				justifyContent: "space-between",
				paddingTop: space.sm,
			}}
		>
			<Text variant="section" style={{ color: tone.text }}>
				{children}
			</Text>
			{trailing ? (
				<Text
					variant="subhead"
					style={{ color: tone.soft, fontVariant: ["tabular-nums"] }}
				>
					{trailing}
				</Text>
			) : null}
		</View>
	);
}

function Label({ children }: { children: string }) {
	const tone = useSheetInk();
	return (
		<Text variant="metaLabel" style={{ color: tone.muted }}>
			{children}
		</Text>
	);
}

/** A choice in a grid of choices: filled white when picked. */
function Choice({
	label,
	selected,
	onPress,
	variant = "chip",
}: {
	label: string;
	selected?: boolean;
	onPress: () => void;
	variant?: "chip" | "ghost";
}) {
	const tone = useSheetInk();
	return (
		<Pressable
			onPress={() => {
				haptics.select();
				onPress();
			}}
			accessibilityRole="button"
			accessibilityState={{ selected: !!selected }}
			style={({ pressed }) => ({
				// Explicit basis: equal cells whatever their label's width.
				flexGrow: 1,
				flexBasis: 0,
				minWidth: 0,
				minHeight: 44,
				paddingHorizontal: space.sm,
				borderRadius: radius.field,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: selected
					? tone.text
					: variant === "chip"
						? tone.chip
						: "transparent",
				opacity: pressed ? 0.7 : 1,
			})}
		>
			<Text
				variant="label"
				numberOfLines={1}
				style={{
					color: selected
						? tone.onText
						: variant === "ghost"
							? tone.soft
							: tone.text,
					fontVariant: ["tabular-nums"],
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}

/** Rows of `columns` choices; the last row keeps the same cell width. */
function Grid<T>({
	items,
	columns,
	render,
}: {
	items: readonly T[];
	columns: number;
	render: (item: T) => ReactNode;
}) {
	const rows: T[][] = [];
	for (let index = 0; index < items.length; index += columns)
		rows.push(items.slice(index, index + columns));
	return (
		<View style={{ gap: space.sm }}>
			{rows.map((row) => (
				<View
					key={String(row[0])}
					style={{ flexDirection: "row", gap: space.sm }}
				>
					{row.map(render)}
					{Array.from({ length: columns - row.length }, (_, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: empty fillers
						<View key={index} style={{ flex: 1 }} />
					))}
				</View>
			))}
		</View>
	);
}

/**
 * The web's speed popover: the rate with ± steps, presets, back to 1×, and
 * the jump amounts, which shape how the transport moves through the book as
 * much as the speed does. Autoplay of the next book closes it.
 */
function PlaybackSheet() {
	const tone = useSheetInk();
	const player = usePlayer();
	const rate = usePlayerState((s) => s.rate);
	const jumpBack = usePlayerState((s) => s.jumpBack);
	const jumpForward = usePlayerState((s) => s.jumpForward);
	const autoplayNext = usePlayerState((s) => s.autoplayNext);
	return (
		<>
			<SheetTitle>{t("audiobook.player_playback_title")}</SheetTitle>
			<View style={{ gap: space.md }}>
				<Label>{t("audiobook.player_speed_title")}</Label>
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<Step
						sign="minus"
						label={t("audiobook.player_speed_slower")}
						disabled={rate <= MIN_SPEED}
						onPress={() => player.setRate(nudgeSpeed(rate, -1))}
					/>
					<Text
						variant="display"
						style={{ color: tone.text, fontVariant: ["tabular-nums"] }}
					>
						{formatSpeed(rate)}
					</Text>
					<Step
						sign="plus"
						label={t("audiobook.player_speed_faster")}
						disabled={rate >= MAX_SPEED}
						onPress={() => player.setRate(nudgeSpeed(rate, 1))}
					/>
				</View>
				<Grid
					items={SPEED_PRESETS}
					columns={3}
					render={(preset) => (
						<Choice
							key={preset}
							label={formatSpeed(preset)}
							selected={rate === preset}
							onPress={() => player.setRate(preset)}
						/>
					)}
				/>
				{rate !== 1 ? (
					<Choice
						variant="ghost"
						label={t("audiobook.player_speed_reset")}
						onPress={() => player.setRate(1)}
					/>
				) : null}
			</View>
			<Divider />
			<View style={{ gap: space.md }}>
				<Label>{t("audiobook.player_jump_title")}</Label>
				<JumpRow
					label={t("audiobook.player_jump_back_label")}
					value={jumpBack}
					onSelect={player.setJumpBack}
				/>
				<JumpRow
					label={t("audiobook.player_jump_forward_label")}
					value={jumpForward}
					onSelect={player.setJumpForward}
				/>
			</View>
			<Divider />
			<Pressable
				onPress={() => player.setAutoplayNext(!autoplayNext)}
				accessibilityRole="switch"
				accessibilityState={{ checked: autoplayNext }}
				style={{
					flexDirection: "row",
					alignItems: "center",
					gap: space.md,
					minHeight: 44,
				}}
			>
				<Text variant="body" style={{ flex: 1, color: tone.text }}>
					{t("audiobook.player_autoplay_next")}
				</Text>
				{/* The platform's own switch: RN's Android one is the pre-Material 3
				    thumb-over-track. */}
				<Toggle value={autoplayNext} onValueChange={player.setAutoplayNext} />
			</Pressable>
		</>
	);
}

function Divider() {
	const tone = useSheetInk();
	return <View style={{ height: 1, backgroundColor: tone.chip }} />;
}

function Step({
	sign,
	label,
	disabled,
	onPress,
}: {
	sign: "minus" | "plus";
	label: string;
	disabled: boolean;
	onPress: () => void;
}) {
	const tone = useSheetInk();
	return (
		<View
			style={{
				width: 52,
				height: 52,
				borderRadius: 26,
				backgroundColor: tone.chip,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<TransportButton
				icon={
					sign === "minus"
						? { ios: "minus", android: "remove" }
						: { ios: "plus", android: "add" }
				}
				label={label}
				color={tone.text}
				box={52}
				disabled={disabled}
				onPress={onPress}
			/>
		</View>
	);
}

function JumpRow({
	label,
	value,
	onSelect,
}: {
	label: string;
	value: JumpAmount;
	onSelect: (amount: JumpAmount) => void;
}) {
	const tone = useSheetInk();
	return (
		<View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
			<Text variant="subhead" style={{ width: 72, color: tone.soft }}>
				{label}
			</Text>
			{JUMP_AMOUNTS.map((amount) => (
				<Choice
					key={amount}
					label={`${amount}s`}
					selected={amount === value}
					onPress={() => onSelect(amount)}
				/>
			))}
		</View>
	);
}

/** Sleep timer: durations, end of chapter or book, and once running, five
 * more minutes or off. */
function SleepSheet({
	book,
	onDone,
}: {
	book: PlayerBook;
	onDone: () => void;
}) {
	const player = usePlayer();
	const mode = usePlayerState((s) => s.sleep?.mode ?? null);
	const remaining = usePlayerState((s) =>
		s.sleep ? Math.ceil(s.sleep.remaining) : null,
	);
	const choose = (next: SleepMode | null) => {
		player.setSleep(next);
		onDone();
	};
	const minutes = mode?.kind === "duration" ? mode.minutes : null;
	return (
		<>
			<SheetTitle trailing={remaining !== null ? clock(remaining) : undefined}>
				{t("audiobook.player_sleep")}
			</SheetTitle>
			<Grid
				items={SLEEP_MINUTES}
				columns={3}
				render={(value) => (
					<Choice
						key={value}
						label={t("audiobook.player_sleep_minutes", { minutes: value })}
						selected={minutes === value}
						onPress={() => choose({ kind: "duration", minutes: value })}
					/>
				)}
			/>
			<View style={{ gap: space.sm }}>
				{book.chapters.length > 0 ? (
					<View style={{ flexDirection: "row" }}>
						<Choice
							label={t("audiobook.player_sleep_end_of_chapter")}
							selected={mode?.kind === "chapter"}
							onPress={() => choose({ kind: "chapter" })}
						/>
					</View>
				) : null}
				<View style={{ flexDirection: "row" }}>
					<Choice
						label={t("audiobook.player_sleep_end_of_book")}
						selected={mode?.kind === "book-end"}
						onPress={() => choose({ kind: "book-end" })}
					/>
				</View>
			</View>
			{mode ? (
				<View style={{ flexDirection: "row", gap: space.sm }}>
					<Choice
						label={t("audiobook.player_sleep_extend")}
						onPress={player.extendSleep}
					/>
					<Choice
						variant="ghost"
						label={t("audiobook.player_sleep_cancel")}
						onPress={() => choose(null)}
					/>
				</View>
			) : null}
		</>
	);
}

export function SleepGlyph({ active }: { active: boolean }) {
	return (
		<Icon
			name={active ? { ios: "moon.zzz.fill", android: "bedtime" } : icons.sleep}
			size={20}
			color={ink.text}
		/>
	);
}
