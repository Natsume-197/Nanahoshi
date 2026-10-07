import { Stack } from "expo-router";
import { t } from "@/lib/i18n";
import { LibrariesScreen } from "@/screens/library/libraries";

export default function LibrariesRoute() {
	return (
		<>
			<Stack.Screen options={{ title: t("nav.libraries") }} />
			<LibrariesScreen />
		</>
	);
}
