import { Stack, useLocalSearchParams } from "expo-router";
import { t } from "@/lib/i18n";
import { SeriesList } from "@/screens/browse/series-list";

export default function SeriesListRoute() {
	const { format } = useLocalSearchParams<{ format?: string }>();
	return (
		<>
			<Stack.Screen options={{ title: t("nav.series") }} />
			<SeriesList
				initialFormat={
					format === "audiobook"
						? "audiobook"
						: format === "ebook"
							? "ebook"
							: undefined
				}
			/>
		</>
	);
}
