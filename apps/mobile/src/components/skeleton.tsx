import { type ReactNode, useRef } from "react";
import { type DimensionValue, useWindowDimensions, View } from "react-native";
import Animated, {
	cancelAnimation,
	FadeIn,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { t } from "@/lib/i18n";
import {
	motion,
	radius,
	sizes,
	space,
	type as typeScale,
	usePalette,
} from "@/theme";

// Placeholders never reorder; stable ids just keep the linter honest.
const KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

/**
 * The `entering` animation for content that replaces a skeleton: a short
 * fade when the page had to wait for it, nothing when it was already cached
 * (a prefetched title opens instantly, as it should).
 */
export function useArrival(ready: boolean) {
	const waited = useRef(!ready);
	return waited.current ? FadeIn.duration(motion.base) : undefined;
}

/** A slow breathe so a placeholder reads as loading, not as an empty page.
 * Holds still when the system asks for reduced motion. */
export function SkeletonPulse({ children }: { children: ReactNode }) {
	const reduceMotion = useReducedMotion();
	const opacity = useSharedValue(1);
	useMountEffect(() => {
		if (reduceMotion) return;
		opacity.set(withRepeat(withTiming(0.5, { duration: 900 }), -1, true));
		return () => cancelAnimation(opacity);
	});
	const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
	return (
		<Animated.View
			accessible
			accessibilityRole="progressbar"
			accessibilityLabel={t("common.loading")}
			style={style}
		>
			{children}
		</Animated.View>
	);
}

export function Bone({
	width,
	height,
	radius = 4,
}: {
	width: DimensionValue;
	height: number;
	radius?: number;
}) {
	const palette = usePalette();
	return (
		<View
			style={{
				width,
				height,
				borderRadius: radius,
				borderCurve: "continuous",
				backgroundColor: palette.skeleton,
			}}
		/>
	);
}

/** One line of text of the given variant: the bar sits in its line box. */
function TextLine({
	variant,
	width,
}: {
	variant: keyof typeof typeScale;
	width: DimensionValue;
}) {
	const { fontSize, lineHeight } = typeScale[variant];
	return (
		<View style={{ height: lineHeight, justifyContent: "center" }}>
			<Bone width={width} height={Math.round(fontSize * 0.8)} />
		</View>
	);
}

/** The title + subtitle under a tile (TitleTile, SeriesTile, CollectionCard). */
function TileCaption({ width }: { width: number }) {
	return (
		<View style={{ gap: 4, minHeight: 64, paddingHorizontal: 2 }}>
			<TextLine variant="tileTitle" width={width * 0.85} />
			<TextLine variant="subhead" width={width * 0.5} />
		</View>
	);
}

/**
 * A rail of placeholder tiles shaped like the real ones: book or square
 * covers, a series' stacked covers, or a collection's square mosaic.
 */
export function ShelfSkeleton({
	width,
	audio,
	shape = audio ? "square" : "book",
	gutter = space.lg,
}: {
	width: number;
	audio?: boolean;
	shape?: "book" | "square" | "series" | "series-square" | "collection";
	gutter?: number;
}) {
	const palette = usePalette();
	const screen = useWindowDimensions().width;
	const count = Math.min(6, Math.ceil(screen / (width + space.lg)));
	return (
		<SkeletonPulse>
			<View
				style={{
					flexDirection: "row",
					gap: space.lg,
					paddingHorizontal: gutter,
					overflow: "hidden",
				}}
			>
				{KEYS.slice(0, count).map((key) => (
					<View key={key} style={{ width, gap: 12 }}>
						<TileArt shape={shape} width={width} radius={palette.coverRadius} />
						<TileCaption width={width} />
					</View>
				))}
			</View>
		</SkeletonPulse>
	);
}

function TileArt({
	shape,
	width,
	radius,
}: {
	shape: "book" | "square" | "series" | "series-square" | "collection";
	width: number;
	radius: number;
}) {
	if (shape === "series" || shape === "series-square") {
		// SeriesTile: the cover sits 8pt down, its stack peeks out top-right.
		const cover = width - 12;
		const height = shape === "series" ? Math.round(cover * 1.5) : cover;
		return (
			<View style={{ width, height: height + 8 }}>
				<View style={{ position: "absolute", top: 0, left: 12, opacity: 0.5 }}>
					<Bone width={cover} height={height} radius={radius} />
				</View>
				<View style={{ position: "absolute", top: 8, left: 0 }}>
					<Bone width={cover} height={height} radius={radius} />
				</View>
			</View>
		);
	}
	const height = shape === "book" ? width * 1.5 : width;
	return <Bone width={width} height={height} radius={radius} />;
}

export function RowSkeleton({
	count = 6,
	square,
}: {
	count?: number;
	square?: boolean;
}) {
	const palette = usePalette();
	return (
		<SkeletonPulse>
			<View style={{ gap: space.md, paddingHorizontal: space.lg }}>
				{KEYS.slice(0, count).map((key) => (
					<View
						key={key}
						style={{
							flexDirection: "row",
							gap: space.md,
							alignItems: "center",
						}}
					>
						<Bone
							width={56}
							height={square ? 56 : 84}
							radius={palette.coverRadius}
						/>
						<View style={{ flex: 1, gap: space.sm }}>
							<Bone width="70%" height={14} />
							<Bone width="40%" height={12} />
						</View>
					</View>
				))}
			</View>
		</SkeletonPulse>
	);
}

/** DetailPanel's shape: a caption, then label-over-value facts in columns. */
export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
	const columns = useWindowDimensions().width >= 640 ? 3 : 2;
	return (
		<SkeletonPulse>
			<View style={{ gap: space.md }}>
				<TextLine variant="subhead" width={120} />
				<View
					style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.lg }}
				>
					{KEYS.slice(0, rows).map((key) => (
						<View
							key={key}
							style={{
								width: `${100 / columns}%`,
								paddingRight: space.md,
								gap: 2,
							}}
						>
							<TextLine variant="subhead" width="55%" />
							<TextLine variant="headline" width="75%" />
						</View>
					))}
				</View>
			</View>
		</SkeletonPulse>
	);
}

/** A settings form: optional avatar, then labelled fields. */
export function FormSkeleton({
	fields = 3,
	avatar,
}: {
	fields?: number;
	avatar?: number;
}) {
	return (
		<SkeletonPulse>
			<View style={{ padding: space.lg, gap: space.xl }}>
				{avatar ? (
					<Bone width={avatar} height={avatar} radius={avatar} />
				) : null}
				{KEYS.slice(0, fields).map((key) => (
					<View key={key} style={{ gap: space.sm }}>
						<TextLine variant="label" width={96} />
						<Bone width="100%" height={sizes.control} radius={radius.field} />
					</View>
				))}
			</View>
		</SkeletonPulse>
	);
}
