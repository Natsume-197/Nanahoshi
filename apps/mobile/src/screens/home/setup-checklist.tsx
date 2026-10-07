import { type Href, router } from "expo-router";
import { View } from "react-native";
import { Icon, type IconName, icons } from "@/components/icon";
import { Pressable } from "@/components/pressable";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import type { SetupStep } from "@/lib/setup-flow";
import { radius, space, usePalette } from "@/theme";

const STEP_COPY: Record<
	SetupStep["id"],
	{ title: string; description: string; icon: IconName; href: Href }
> = {
	library: {
		title: "mobile.setup.checklist_library",
		description: "mobile.setup.checklist_library_desc",
		icon: icons.shelf,
		href: "/setup/library",
	},
	upload: {
		title: "mobile.setup.checklist_upload",
		description: "mobile.setup.checklist_upload_desc",
		icon: icons.upload,
		href: "/setup/upload",
	},
};

/**
 * Fable's "Let's get set up" card for an empty server: a welcome, then each
 * step as a row that opens its guided flow, ticked once it's done.
 */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
	const palette = usePalette();
	return (
		<View
			style={{
				marginHorizontal: space.lg,
				padding: space.xl,
				gap: space.lg,
				borderRadius: radius.card,
				borderCurve: "continuous",
				backgroundColor: palette.surfaceCard,
			}}
		>
			<View style={{ gap: space.xs }}>
				<Text variant="label" tone="accent">
					{t("mobile.setup.checklist_eyebrow")}
				</Text>
				<Text variant="title" accessibilityRole="header">
					{t("mobile.setup.checklist_title")}
				</Text>
				<Text variant="subhead" tone="secondary">
					{t("mobile.setup.checklist_lead")}
				</Text>
			</View>
			<View style={{ gap: space.sm }}>
				{steps.map((step) => (
					<StepRow key={step.id} step={step} />
				))}
			</View>
		</View>
	);
}

function StepRow({ step }: { step: SetupStep }) {
	const palette = usePalette();
	const copy = STEP_COPY[step.id];
	const title = t(copy.title);
	return (
		<Pressable
			onPress={() => router.push(copy.href)}
			disabled={step.done}
			accessibilityRole="button"
			accessibilityLabel={title}
			accessibilityState={{ checked: step.done, disabled: step.done }}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				padding: space.md,
				borderRadius: radius.field,
				borderCurve: "continuous",
				overflow: "hidden",
				backgroundColor:
					pressed && process.env.EXPO_OS === "ios"
						? palette.surfaceCardHover
						: palette.background,
			})}
		>
			<View
				style={{
					width: 40,
					height: 40,
					borderRadius: radius.field,
					borderCurve: "continuous",
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: step.done ? palette.accentSoft : palette.surface,
				}}
			>
				<Icon
					name={step.done ? icons.check : copy.icon}
					size={20}
					color={step.done ? palette.accent : palette.textSecondary}
					weight={step.done ? "bold" : undefined}
				/>
			</View>
			<View style={{ flex: 1, gap: 2 }}>
				<Text
					variant="headline"
					tone={step.done ? "secondary" : "primary"}
					style={step.done ? { textDecorationLine: "line-through" } : undefined}
				>
					{title}
				</Text>
				{step.done ? null : (
					<Text variant="caption" tone="secondary">
						{t(copy.description)}
					</Text>
				)}
			</View>
			{step.done ? null : (
				<Icon
					name={icons.chevronRight}
					size={16}
					color={palette.textTertiary}
				/>
			)}
		</Pressable>
	);
}
