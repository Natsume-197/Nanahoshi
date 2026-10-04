import { Stack, useLocalSearchParams } from "expo-router";
import { t } from "@/lib/i18n";
import { EntityTitles } from "@/screens/browse/title-lists";

export default function TagRoute() {
	const { uuid, name } = useLocalSearchParams<{
		uuid: string;
		name?: string;
	}>();
	return (
		<>
			<Stack.Screen
				options={{
					title: name
						? name.charAt(0).toUpperCase() + name.slice(1)
						: t("entity_page.tag_fallback"),
				}}
			/>
			<EntityTitles key={uuid} kind="tag" uuid={uuid} />
		</>
	);
}
