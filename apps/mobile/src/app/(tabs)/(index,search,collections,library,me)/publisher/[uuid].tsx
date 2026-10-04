import { Stack, useLocalSearchParams } from "expo-router";
import { PublisherTitles } from "@/screens/browse/title-lists";

export default function PublisherRoute() {
	const { uuid, name } = useLocalSearchParams<{
		uuid: string;
		name?: string;
	}>();
	return (
		<>
			<Stack.Screen options={{ title: name ?? "" }} />
			<PublisherTitles key={uuid} uuid={uuid} />
		</>
	);
}
