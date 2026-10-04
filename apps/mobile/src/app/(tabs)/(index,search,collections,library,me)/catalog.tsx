import { Stack, useLocalSearchParams } from "expo-router";
import { t } from "@/lib/i18n";
import { Catalog } from "@/screens/browse/catalog";

export default function CatalogRoute() {
	const { format } = useLocalSearchParams<{ format?: string }>();
	return (
		<>
			<Stack.Screen options={{ title: t("nav.catalog") }} />
			<Catalog
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
