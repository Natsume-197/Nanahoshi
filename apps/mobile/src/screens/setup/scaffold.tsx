import { router } from "expo-router";
import type { ReactNode } from "react";
import {
	BackHandler,
	KeyboardAvoidingView,
	Pressable,
	ScrollView,
	View,
} from "react-native";
import Animated, {
	FadeIn,
	FadeInLeft,
	FadeInRight,
	ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { EASE_OUT, motion, radius, sizes, space, usePalette } from "@/theme";

/**
 * One question per screen, Fable's onboarding shape: a round back (or close)
 * button, the step bar, a big heading with one line of help, the answer, and
 * the actions pinned at the bottom where the thumb already is.
 */
export function SetupStep({
	title,
	lead,
	step,
	leading = "back",
	onBack = () => router.back(),
	footer,
	children,
}: {
	title: string;
	lead?: string;
	/** Where this screen sits in its flow; no bar for one-screen flows. */
	step?: { index: number; total: number };
	/** The first screen of a flow closes it; later ones go back a step. */
	leading?: "back" | "close" | "none";
	onBack?: () => void;
	footer?: ReactNode;
	children?: ReactNode;
}) {
	const insets = useSafeAreaInsets();
	return (
		<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
			<View
				style={{
					paddingTop: insets.top + space.sm,
					paddingHorizontal: space.lg,
					gap: space.lg,
				}}
			>
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: space.lg,
						minHeight: sizes.control,
					}}
				>
					{leading === "none" ? null : (
						<CircleButton
							icon={leading === "close" ? icons.dismiss : icons.back}
							label={
								leading === "close" ? t("common.close") : t("aria.go_back")
							}
							onPress={onBack}
						/>
					)}
					{step ? <StepBar {...step} /> : null}
				</View>
			</View>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{
					flexGrow: 1,
					paddingHorizontal: space.lg,
					paddingTop: space.xl,
					paddingBottom: space.xl,
					gap: space.xl,
				}}
			>
				<View style={{ gap: space.sm }}>
					<Text variant="display" accessibilityRole="header">
						{title}
					</Text>
					{lead ? (
						<Text variant="lead" tone="secondary">
							{lead}
						</Text>
					) : null}
				</View>
				{children}
			</ScrollView>
			{footer ? <Footer>{footer}</Footer> : null}
		</KeyboardAvoidingView>
	);
}

/**
 * The beat after something is made (Fable's "Goal set ✓"): a check that
 * pops in, what just happened, and where to go next. No way back: the form
 * behind it already did its work.
 */
export function SetupDone({
	title,
	lead,
	footer,
}: {
	title: string;
	lead?: string;
	footer: ReactNode;
}) {
	const palette = usePalette();
	useMountEffect(() => {
		haptics.success();
	});
	return (
		<View style={{ flex: 1 }}>
			<View
				style={{
					flex: 1,
					justifyContent: "center",
					paddingHorizontal: space.xl,
					gap: space.xl,
				}}
			>
				<Animated.View
					entering={ZoomIn.springify().damping(14).delay(80)}
					style={{
						width: 72,
						height: 72,
						borderRadius: radius.pill,
						alignItems: "center",
						justifyContent: "center",
						backgroundColor: palette.accentSoft,
					}}
				>
					<Icon
						name={icons.check}
						size={34}
						color={palette.accent}
						weight="bold"
					/>
				</Animated.View>
				<Animated.View
					entering={FadeIn.duration(motion.base).easing(EASE_OUT).delay(160)}
					style={{ gap: space.sm }}
				>
					<Text
						variant="display"
						accessibilityRole="header"
						accessibilityLiveRegion="polite"
					>
						{title}
					</Text>
					{lead ? (
						<Text variant="lead" tone="secondary">
							{lead}
						</Text>
					) : null}
				</Animated.View>
			</View>
			<Footer>{footer}</Footer>
		</View>
	);
}

function Footer({ children }: { children: ReactNode }) {
	const insets = useSafeAreaInsets();
	return (
		<View
			style={{
				paddingHorizontal: space.lg,
				paddingTop: space.md,
				paddingBottom: Math.max(insets.bottom, space.lg),
				gap: space.sm,
			}}
		>
			{children}
		</View>
	);
}

/** Thin segments, one per step, filled up to this one. */
function StepBar({ index, total }: { index: number; total: number }) {
	const palette = usePalette();
	return (
		<View
			accessible
			accessibilityRole="progressbar"
			accessibilityLabel={t("mobile.setup.step", { step: index + 1, total })}
			accessibilityValue={{ min: 1, max: total, now: index + 1 }}
			style={{ flex: 1, flexDirection: "row", gap: space.xs }}
		>
			{Array.from({ length: total }, (_, i) => (
				<View
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed positional segments
					key={i}
					style={{
						flex: 1,
						height: 4,
						borderRadius: radius.pill,
						backgroundColor: i <= index ? palette.accent : palette.surface,
					}}
				/>
			))}
		</View>
	);
}

function CircleButton({
	icon,
	label,
	onPress,
}: {
	icon: IconName;
	label: string;
	onPress: () => void;
}) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={8}
			android_ripple={{ color: palette.ripple, borderless: true }}
			style={({ pressed }) => ({
				width: sizes.control,
				height: sizes.control,
				borderRadius: radius.pill,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: palette.surface,
				opacity: pressed && process.env.EXPO_OS === "ios" ? 0.7 : 1,
			})}
		>
			<Icon name={icon} size={20} color={palette.text} />
		</Pressable>
	);
}

/** A big tappable answer (library type, destination): icon, label, help, and
 * a check when it's the one picked. */
export function ChoiceCard({
	icon,
	title,
	description,
	selected,
	onPress,
}: {
	icon: IconName;
	title: string;
	description?: string;
	selected?: boolean;
	onPress: () => void;
}) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={() => {
				haptics.select();
				onPress();
			}}
			accessibilityRole="radio"
			accessibilityState={{ selected: !!selected }}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.lg,
				padding: space.lg,
				borderRadius: radius.card,
				borderCurve: "continuous",
				borderWidth: selected ? 2 : 1,
				borderColor: selected ? palette.accent : palette.separator,
				// Same footprint picked or not: the thicker ring eats the padding.
				margin: selected ? 0 : 1,
				overflow: "hidden",
				backgroundColor:
					pressed && process.env.EXPO_OS === "ios"
						? palette.surfaceCardHover
						: palette.surfaceCard,
			})}
		>
			<View
				style={{
					width: 48,
					height: 48,
					borderRadius: radius.field,
					borderCurve: "continuous",
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: selected ? palette.accentSoft : palette.surface,
				}}
			>
				<Icon
					name={icon}
					size={24}
					color={selected ? palette.accent : palette.textSecondary}
				/>
			</View>
			<View style={{ flex: 1, gap: 2 }}>
				<Text variant="listTitle">{title}</Text>
				{description ? (
					<Text variant="subhead" tone="secondary">
						{description}
					</Text>
				) : null}
			</View>
			{selected ? (
				<Icon
					name={icons.check}
					size={20}
					color={palette.accent}
					weight="bold"
				/>
			) : null}
		</Pressable>
	);
}

/** Android's back button steps back inside a flow instead of closing it.
 * Mount it only on steps that have a previous one. */
export function HardwareBack({ onBack }: { onBack: () => void }) {
	useMountEffect(() => {
		const subscription = BackHandler.addEventListener(
			"hardwareBackPress",
			() => {
				onBack();
				return true;
			},
		);
		return () => subscription.remove();
	});
	return null;
}

/** Each step slides in from the side it comes from: forward from the right,
 * back from the left. Keyed, so a new step mounts fresh. */
export function StepTransition({
	stepKey,
	direction,
	children,
}: {
	stepKey: string;
	direction: 1 | -1;
	children: ReactNode;
}) {
	const entering = (direction === 1 ? FadeInRight : FadeInLeft)
		.duration(motion.base)
		.easing(EASE_OUT);
	return (
		<Animated.View key={stepKey} entering={entering} style={{ flex: 1 }}>
			{children}
		</Animated.View>
	);
}
