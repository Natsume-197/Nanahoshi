import type { ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { space } from "@/theme";
import { Text } from "./text";

export type DetailRow = { label: string; value: ReactNode };

/** A titled block of label-over-value facts in columns, flat like the rest
 * of the detail page (Fable's "Format / Length" grid). */
export function DetailPanel({
	title,
	rows: allRows,
}: {
	title: string;
	/** Rows with no value pass null and are skipped. */
	rows: (DetailRow | null)[];
}) {
	const { width } = useWindowDimensions();
	const columns = width >= 640 ? 3 : 2;
	const rows = allRows.filter((row): row is DetailRow => row !== null);
	if (rows.length === 0) return null;
	return (
		<View style={{ gap: space.md }}>
			<Text variant="subhead" tone="secondary" accessibilityRole="header">
				{title}
			</Text>
			<View
				style={{ flexDirection: "row", flexWrap: "wrap", rowGap: space.lg }}
			>
				{rows.map((row) => (
					<View
						key={row.label}
						style={{
							// Long values (file names, descriptions) take the whole row.
							width:
								typeof row.value === "string" && row.value.length > 28
									? "100%"
									: `${100 / columns}%`,
							paddingRight: space.md,
							gap: 2,
						}}
					>
						<Text variant="subhead" tone="secondary">
							{row.label}
						</Text>
						{typeof row.value === "string" ? (
							<Text variant="headline" selectable style={{ fontWeight: "500" }}>
								{row.value}
							</Text>
						) : (
							row.value
						)}
					</View>
				))}
			</View>
		</View>
	);
}
