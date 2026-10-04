import { Stack, useLocalSearchParams } from "expo-router";
import { NarratorTitles } from "@/screens/browse/title-lists";

export default function NarratorRoute() {
	const { uuid, name } = useLocalSearchParams<{
		uuid: string;
		name?: string;
	}>();
	return (
		<>
			<Stack.Screen options={{ title: name ?? "" }} />
			<NarratorTitles key={uuid} uuid={uuid} />
		</>
	);
}
