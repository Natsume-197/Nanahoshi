import { Stack, useLocalSearchParams } from "expo-router";
import { EntityTitles } from "@/screens/browse/title-lists";

export default function PublisherRoute() {
	const { uuid, name } = useLocalSearchParams<{
		uuid: string;
		name?: string;
	}>();
	return (
		<>
			<Stack.Screen options={{ title: name ?? "" }} />
			<EntityTitles key={uuid} kind="publisher" uuid={uuid} />
		</>
	);
}
