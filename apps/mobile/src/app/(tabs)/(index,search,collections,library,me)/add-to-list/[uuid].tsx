import { Stack, useLocalSearchParams } from "expo-router";
import { t } from "@/lib/i18n";
import { AddToList } from "@/screens/detail/add-to-list";

export default function AddToListRoute() {
	const { uuid, kind } = useLocalSearchParams<{
		uuid: string;
		kind?: string;
	}>();
	return (
		<>
			<Stack.Screen options={{ title: t("add_to_list.title") }} />
			<AddToList
				uuid={uuid}
				kind={kind === "audiobook" ? "audiobook" : "ebook"}
			/>
		</>
	);
}
