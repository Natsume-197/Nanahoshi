import { Image } from "expo-image";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Icon, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { locale, t } from "@/lib/i18n";
import { welcomeCoverRows } from "@/lib/welcome-covers";
import { space } from "@/theme";
import type { Paper } from "./welcome-paper";

const CARD_RADIUS = 22;
// The player shows an audiobook, so its art is one of the square covers.
const COVER =
	welcomeCoverRows()
		.flat()
		.find((cover) => cover.square)?.uri ?? "";

/** Bookmory's device-less mockup: a card of the real screen, never a phone frame. */
function MockCard({
	paper,
	width,
	children,
}: {
	paper: Paper;
	width: number;
	children: ReactNode;
}) {
	return (
		<View
			style={{
				width,
				borderRadius: CARD_RADIUS,
				borderCurve: "continuous",
				backgroundColor: paper.paper,
				padding: space.xl,
				gap: space.md,
				boxShadow: "0 12px 32px rgba(0, 0, 0, 0.12)",
			}}
		>
			{children}
		</View>
	);
}

function Line({
	paper,
	width,
	marked,
}: {
	paper: Paper;
	width: `${number}%`;
	marked?: boolean;
}) {
	return (
		<View
			style={{
				width,
				height: 9,
				borderRadius: 5,
				backgroundColor: marked ? paper.mockMark : paper.mockLine,
			}}
		/>
	);
}

/** A page of a book with the spoken sentence lit, and the player under it. */
export function ReadListenMock({
	paper,
	width,
}: {
	paper: Paper;
	width: number;
}) {
	return (
		<View style={{ alignItems: "center" }}>
			<MockCard paper={paper} width={width}>
				<View style={{ gap: 11, paddingBottom: space.lg }}>
					<Line paper={paper} width="92%" />
					<Line paper={paper} width="100%" />
					<Line paper={paper} width="84%" marked />
					<Line paper={paper} width="96%" marked />
					<Line paper={paper} width="100%" />
					<Line paper={paper} width="70%" />
					<Line paper={paper} width="88%" />
				</View>
			</MockCard>
			<View
				style={{
					width: width - space.xxl,
					marginTop: -space.xxl,
					flexDirection: "row",
					alignItems: "center",
					gap: space.md,
					padding: space.sm + 2,
					borderRadius: 16,
					borderCurve: "continuous",
					backgroundColor: paper.fill,
					boxShadow: "0 10px 24px rgba(0, 0, 0, 0.18)",
				}}
			>
				<Image
					source={COVER}
					cachePolicy="disk"
					contentFit="cover"
					style={{
						width: 46,
						height: 46,
						borderRadius: 4,
						backgroundColor: paper.tint,
					}}
				/>
				<View style={{ flex: 1, gap: 7 }}>
					<View
						style={{
							width: "70%",
							height: 8,
							borderRadius: 4,
							backgroundColor: paper.onFill,
							opacity: 0.85,
						}}
					/>
					<View
						style={{
							height: 3,
							borderRadius: 2,
							backgroundColor: paper.onFill,
							opacity: 0.25,
						}}
					>
						<View
							style={{
								width: "42%",
								height: 3,
								borderRadius: 2,
								backgroundColor: paper.onFill,
							}}
						/>
					</View>
				</View>
				<View
					style={{
						width: 36,
						height: 36,
						borderRadius: 18,
						alignItems: "center",
						justifyContent: "center",
						backgroundColor: paper.onFill,
					}}
				>
					<Icon name={icons.pause} size={18} color={paper.fill} />
				</View>
			</View>
		</View>
	);
}

/** The week's reading and today's goal, nearly met. */
const WEEK = [0.45, 0.7, 0.3, 0.85, 0.55, 1, 0.8];

export function PaceMock({ paper, width }: { paper: Paper; width: number }) {
	// Monday first, as the stats page draws it; today is the last bar.
	const monday = new Date(2024, 0, 1);
	const days = WEEK.map((_, i) =>
		new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(
			new Date(monday.getTime() + i * 86_400_000),
		),
	);
	return (
		<MockCard paper={paper} width={width}>
			<Text
				variant="label"
				style={{ color: paper.ink, fontSize: 15, lineHeight: 20 }}
			>
				{t("mobile.intro.week")}
			</Text>
			<View
				style={{
					height: 96,
					flexDirection: "row",
					alignItems: "flex-end",
					gap: space.sm,
				}}
			>
				{WEEK.map((value, i) => (
					<View
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed week
						key={i}
						style={{
							flex: 1,
							height: `${value * 100}%`,
							borderRadius: 6,
							backgroundColor:
								i === WEEK.length - 1 ? paper.fill : paper.mockLine,
						}}
					/>
				))}
			</View>
			<View style={{ flexDirection: "row", gap: space.sm }}>
				{days.map((day, i) => (
					<Text
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed week
						key={i}
						variant="caption"
						style={{
							flex: 1,
							textAlign: "center",
							color: i === days.length - 1 ? paper.ink : paper.inkSoft,
						}}
					>
						{day}
					</Text>
				))}
			</View>
			<View
				style={{
					marginTop: space.sm,
					padding: space.md,
					gap: space.sm,
					borderRadius: 14,
					backgroundColor: paper.tint,
				}}
			>
				<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
					<Text variant="caption" style={{ color: paper.inkSoft }}>
						{t("mobile.intro.goal_today")}
					</Text>
					<Text
						variant="caption"
						style={{
							color: paper.ink,
							fontWeight: "600",
							fontVariant: ["tabular-nums"],
						}}
					>
						{t("mobile.intro.goal_value", { done: 26, goal: 30 })}
					</Text>
				</View>
				<View
					style={{
						height: 6,
						borderRadius: 3,
						backgroundColor: paper.mockLine,
					}}
				>
					<View
						style={{
							width: "87%",
							height: 6,
							borderRadius: 3,
							backgroundColor: paper.fill,
						}}
					/>
				</View>
			</View>
		</MockCard>
	);
}
