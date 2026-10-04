import { Host } from "@expo/ui";
import { DatePicker } from "@expo/ui/swift-ui";
import { datePickerStyle } from "@expo/ui/swift-ui/modifiers";
import { useColorScheme } from "react-native";
import { fromDateValue, toDateValue } from "@/lib/date-value";

/** SwiftUI's compact date picker: the date as a button that pops a calendar. */
export function DateField({
	value,
	label,
	onChange,
}: {
	value: string;
	label: string;
	onChange: (value: string) => void;
}) {
	const scheme = useColorScheme();
	return (
		<Host matchContents colorScheme={scheme === "dark" ? "dark" : "light"}>
			<DatePicker
				title={label}
				selection={fromDateValue(value) ?? new Date()}
				displayedComponents={["date"]}
				onDateChange={(date) => onChange(toDateValue(date))}
				modifiers={[datePickerStyle("compact")]}
			/>
		</Host>
	);
}
