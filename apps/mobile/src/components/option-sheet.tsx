import { BottomSheet, RNHostView } from "@expo/ui";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { locale } from "@/lib/i18n";
import { radius, space, usePalette } from "@/theme";
import { Icon, icons } from "./icon";
import { SearchField } from "./search-field";
import { Text } from "./text";

export type SheetOption = {
	value: string;
	label: string;
	badge?: string;
	disabled?: boolean;
};
export type SheetSection = { title?: string; options: SheetOption[] };

/**
 * A searchable pick-one list in the platform's own bottom sheet (the one
 * the player uses). Filters by label unless `onQuery` hands the search to
 * the caller (remote results).
 */
export function OptionSheet({
	title,
	description,
	searchPlaceholder,
	sections,
	emptyLabel,
	loading,
	selected,
	onQuery,
	onSelect,
	onClose,
}: {
	title: string;
	description?: string;
	searchPlaceholder?: string;
	sections: SheetSection[];
	emptyLabel: string;
	loading?: boolean;
	selected?: string;
	onQuery?: (query: string) => void;
	onSelect: (value: string) => void;
	onClose: () => void;
}) {
	const palette = usePalette();
	const insets = useSafeAreaInsets();
	const { width, height } = useWindowDimensions();
	const [query, setQuery] = useState("");
	const needle = query.toLocaleLowerCase(locale);
	const visible = onQuery
		? sections
		: sections
				.map((section) => ({
					...section,
					options: section.options.filter((option) =>
						option.label.toLocaleLowerCase(locale).includes(needle),
					),
				}))
				.filter((section) => section.options.length > 0);
	const empty = visible.every((section) => section.options.length === 0);

	return (
		<BottomSheet
			isPresented
			onDismiss={onClose}
			snapPoints={["half", "full"]}
			containerColor={palette.card}
			contentPadding={0}
		>
			{/* Hosted, not bare: RN views set straight into the Compose sheet
			    drew but never received a press. */}
			<RNHostView matchContents>
				<View
					style={{
						width,
						paddingHorizontal: space.lg,
						paddingBottom: insets.bottom + space.lg,
						gap: space.md,
					}}
				>
					<View style={{ gap: space.xs }}>
						<Text variant="headline" accessibilityRole="header">
							{title}
						</Text>
						{description ? (
							<Text variant="subhead" tone="secondary">
								{description}
							</Text>
						) : null}
					</View>
					{searchPlaceholder ? (
						<SearchField
							placeholder={searchPlaceholder}
							onQuery={(next) => {
								setQuery(next);
								onQuery?.(next);
							}}
						/>
					) : null}
					<ScrollView
						style={{ maxHeight: height * 0.6 }}
						keyboardShouldPersistTaps="handled"
						contentContainerStyle={{ paddingBottom: space.lg }}
					>
						{loading ? (
							<ActivityIndicator style={{ paddingVertical: space.xl }} />
						) : empty ? (
							<Text
								variant="subhead"
								tone="secondary"
								style={{ textAlign: "center", paddingVertical: space.xl }}
							>
								{emptyLabel}
							</Text>
						) : (
							visible.map((section, index) => (
								<View key={section.title ?? index} style={{ gap: 2 }}>
									{section.title ? (
										<Text
											variant="metaLabel"
											tone="secondary"
											style={{
												paddingHorizontal: space.md,
												paddingTop: index > 0 ? space.lg : 0,
												paddingBottom: space.xs,
											}}
										>
											{section.title}
										</Text>
									) : null}
									{section.options.map((option) => (
										<Pressable
											key={option.value}
											disabled={option.disabled}
											onPress={() => onSelect(option.value)}
											accessibilityRole="button"
											accessibilityState={{
												disabled: option.disabled,
												selected: option.value === selected,
											}}
											android_ripple={{ color: palette.ripple }}
											style={({ pressed }) => ({
												flexDirection: "row",
												alignItems: "center",
												gap: space.md,
												minHeight: 48,
												paddingHorizontal: space.md,
												borderRadius: radius.field,
												overflow: "hidden",
												opacity: option.disabled ? 0.4 : 1,
												backgroundColor:
													pressed && process.env.EXPO_OS === "ios"
														? palette.surface
														: "transparent",
											})}
										>
											<Text variant="body" style={{ flex: 1 }}>
												{option.label}
											</Text>
											{option.badge ? (
												<Text variant="caption" tone="secondary">
													{option.badge}
												</Text>
											) : null}
											{option.value === selected ? (
												<Icon
													name={icons.check}
													size={18}
													color={palette.accent}
												/>
											) : null}
										</Pressable>
									))}
								</View>
							))
						)}
					</ScrollView>
				</View>
			</RNHostView>
		</BottomSheet>
	);
}
