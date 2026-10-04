import { Stack, useLocalSearchParams } from "expo-router";
import { t } from "@/lib/i18n";
import { EntityTitles } from "@/screens/browse/title-lists";

export default function GenreRoute() {
	const { uuid, name } = useLocalSearchParams<{
		uuid: string;
		name?: string;
	}>();
	return (
		<>
			<Stack.Screen options={{ title: name ?? t("nav.genres") }} />
			<EntityTitles key={uuid} kind="genre" uuid={uuid} />
		</>
	);
}
