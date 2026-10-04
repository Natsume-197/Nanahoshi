import { DatePickerDialog } from "@expo/ui/jetpack-compose";
import { useState } from "react";
import { Pressable } from "react-native";
import { fromDateValue, toDateValue } from "@/lib/date-value";
import { locale, t } from "@/lib/i18n";
import { radius, sizes, space, usePalette } from "@/theme";
import { Icon, icons } from "../icon";
import { DetachedHost } from "../sheet/detached-host";
import { Text } from "../text";

/** A date field that opens Material's date picker dialog. */
export function DateField({
	value,
	label,
	onChange,
}: {
	value: string;
	label: string;
	onChange: (value: string) => void;
}) {
	const palette = usePalette();
	const [open, setOpen] = useState(false);
	const date = fromDateValue(value);
	return (
		<>
			<Pressable
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				accessibilityLabel={label}
				android_ripple={{ color: palette.ripple }}
				style={{
					minHeight: sizes.control,
					flexDirection: "row",
					alignItems: "center",
					gap: space.sm,
					paddingHorizontal: space.md,
					borderRadius: radius.field,
					borderWidth: 1,
					borderColor: palette.separator,
					overflow: "hidden",
				}}
			>
				<Icon name={icons.clock} size={16} color={palette.textSecondary} />
				<Text
					variant="subhead"
					tone={date ? "primary" : "secondary"}
					numberOfLines={1}
				>
					{date
						? date.toLocaleDateString(locale, { dateStyle: "medium" })
						: t("mobile.collection.pick_date")}
				</Text>
			</Pressable>
			{open ? (
				<DetachedHost>
					<DatePickerDialog
						initialDate={date ? date.toISOString() : null}
						confirmButtonLabel={t("common.apply")}
						dismissButtonLabel={t("common.cancel")}
						color={palette.card}
						onDateSelected={(picked) => {
							setOpen(false);
							onChange(toDateValue(picked));
						}}
						onDismissRequest={() => setOpen(false)}
					/>
				</DetachedHost>
			) : null}
		</>
	);
}
