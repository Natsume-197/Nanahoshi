import { type Href, Link } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable } from "@/components/pressable";
import { Text } from "@/components/text";
import { haptics } from "@/lib/haptics";
import { COVER_ASPECT, space, usePalette } from "@/theme";

// One flat page, Fable-style: sections split by hairlines, no cards.

export function useDetailGutter() {
	const { width } = useWindowDimensions();
	return width >= 1024 ? 32 : width >= 768 ? 24 : 16;
}

/** The page column; full-bleed rails sit outside it. */
export function DetailColumn({ children }: { children: ReactNode }) {
	const gutter = useDetailGutter();
	return (
		<View
			style={{
				paddingHorizontal: gutter,
				width: "100%",
				maxWidth: 760,
				alignSelf: "center",
			}}
		>
			{children}
		</View>
	);
}

export function Divider() {
	const palette = usePalette();
	return (
		<View
			style={{
				height: 1,
				backgroundColor: palette.separator,
				marginVertical: space.xl,
			}}
		/>
	);
}

/** Small secondary label over a block ("From the publisher"). */
export function SectionLabel({ children }: { children: string }) {
	return (
		<Text variant="subhead" tone="secondary" accessibilityRole="header">
			{children}
		</Text>
	);
}

export type InfoItem = {
	label: string;
	value: string;
	href?: Href;
	onPress?: () => void;
};

/** Label over value in two columns: the book's facts at a glance. */
export function InfoGrid({ items: all }: { items: (InfoItem | null)[] }) {
	const { width } = useWindowDimensions();
	const items = all.filter((item): item is InfoItem => item !== null);
	if (items.length === 0) return null;
	const columns = width >= 640 ? 3 : 2;
	return (
		<View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.lg }}>
			{items.map((item) => (
				<View
					key={item.label}
					style={{
						width: `${100 / columns}%`,
						paddingRight: space.md,
						gap: 2,
					}}
				>
					<Text variant="subhead" tone="secondary">
						{item.label}
					</Text>
					<InfoValue item={item} />
				</View>
			))}
		</View>
	);
}

function InfoValue({ item }: { item: InfoItem }) {
	const text = (
		<Text
			variant="headline"
			selectable={!item.href && !item.onPress}
			style={{ fontWeight: "500", fontVariant: ["tabular-nums"] }}
		>
			{item.value}
		</Text>
	);
	if (item.href) return <Link href={item.href}>{text}</Link>;
	if (item.onPress)
		return (
			<Pressable
				onPress={item.onPress}
				accessibilityRole="link"
				style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
			>
				{text}
			</Pressable>
		);
	return text;
}

/** Fable's tabs: left-aligned labels, the active one in full ink with an
 * underline, a hairline across the page. Scrolls when they don't fit. */
export function DetailTabs<T extends string>({
	options,
	value,
	onChange,
}: {
	options: readonly { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
}) {
	const palette = usePalette();
	const gutter = useDetailGutter();
	return (
		<View style={{ borderBottomWidth: 1, borderColor: palette.separator }}>
			{/* Scrolls out to the screen edge, so a fourth tab runs off the side
			    instead of being cut at the page gutter. */}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ marginHorizontal: -gutter }}
				contentContainerStyle={{ gap: space.xl, paddingHorizontal: gutter }}
				accessibilityRole="tablist"
			>
				{options.map((option) => {
					const active = option.value === value;
					return (
						<Pressable
							key={option.value}
							accessibilityRole="tab"
							accessibilityState={{ selected: active }}
							onPress={() => {
								if (!active) haptics.select();
								onChange(option.value);
							}}
							style={{ minHeight: 48, justifyContent: "center" }}
						>
							<Text
								variant="headline"
								numberOfLines={1}
								style={{
									fontWeight: "600",
									color: active ? palette.text : palette.textSecondary,
								}}
							>
								{option.label}
							</Text>
							<View
								style={{
									position: "absolute",
									left: 0,
									right: 0,
									bottom: 0,
									height: 3,
									borderRadius: 1.5,
									backgroundColor: active ? palette.text : "transparent",
								}}
							/>
						</Pressable>
					);
				})}
			</ScrollView>
		</View>
	);
}

/** Loading shape of the hero: cover, title, byline, the two actions. */
export function DetailSkeleton({ audio }: { audio: boolean }) {
	const palette = usePalette();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const gutter = useDetailGutter();
	const cover = audio ? Math.min(240, width - 96) : Math.min(200, width - 150);
	const block = (w: number | `${number}%`, h: number, r = 6) => (
		<View
			style={{
				width: w,
				height: h,
				borderRadius: r,
				borderCurve: "continuous",
				backgroundColor: palette.skeleton,
			}}
		/>
	);
	return (
		<View
			accessibilityRole="progressbar"
			style={{
				paddingTop: insets.top + 64,
				paddingHorizontal: gutter,
				gap: space.xl,
			}}
		>
			<View style={{ alignItems: "center" }}>
				{block(
					cover,
					audio ? cover : Math.round(cover * COVER_ASPECT),
					palette.coverRadius,
				)}
			</View>
			<View style={{ gap: space.sm, marginTop: space.sm }}>
				{block("75%", 32)}
				{block("40%", 18)}
			</View>
			<View style={{ gap: space.md }}>
				{block("100%", 52, 11)}
				{block("100%", 52, 11)}
			</View>
		</View>
	);
}
