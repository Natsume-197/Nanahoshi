import { Host, Picker, Text } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";

/** UIKit-backed selection; longer lists use a native menu instead of clipped segments. */
export function LineTabs<T extends string>({
	options,
	value,
	onChange,
}: {
	options: readonly { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
	scrollable?: boolean;
}) {
	return (
		<Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
			<Picker
				selection={value}
				onSelectionChange={onChange}
				modifiers={[pickerStyle(options.length > 3 ? "menu" : "segmented")]}
			>
				{options.map((option) => (
					<Text key={option.value} modifiers={[tag(option.value)]}>
						{option.label}
					</Text>
				))}
			</Picker>
		</Host>
	);
}
