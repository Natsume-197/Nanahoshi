import { Stack } from "expo-router";
import { t } from "@/lib/i18n";
import { EntityList } from "@/screens/browse/entity-list";

export default function AuthorsRoute() {
	return (
		<>
			<Stack.Screen options={{ title: t("nav.authors") }} />
			<EntityList kind="authors" />
		</>
	);
}
