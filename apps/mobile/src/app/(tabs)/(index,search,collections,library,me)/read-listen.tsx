import { Stack } from "expo-router";
import { t } from "@/lib/i18n";
import { ReadListenScreen } from "@/screens/read-listen";

export default function ReadListenRoute() {
	return (
		<>
			<Stack.Screen options={{ title: t("nav.read_listen") }} />
			<ReadListenScreen />
		</>
	);
}
