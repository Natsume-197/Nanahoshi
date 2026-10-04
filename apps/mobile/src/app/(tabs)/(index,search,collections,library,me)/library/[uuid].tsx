import { Stack, useLocalSearchParams } from "expo-router";
import { LibraryTitles } from "@/screens/browse/title-lists";

export default function LibraryRoute() {
	const { uuid, name } = useLocalSearchParams<{
		uuid: string;
		name?: string;
	}>();
	return (
		<>
			<Stack.Screen options={{ title: name ?? "" }} />
			<LibraryTitles key={uuid} uuid={uuid} />
		</>
	);
}
