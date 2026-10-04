import { Stack, useLocalSearchParams } from "expo-router";
import { LibraryTitles } from "@/screens/browse/title-lists";
import { LibraryHeaderMenu } from "@/screens/library/library-header-menu";

export default function LibraryRoute() {
	const { uuid, name } = useLocalSearchParams<{
		uuid: string;
		name?: string;
	}>();
	return (
		<>
			<Stack.Screen options={{ title: name ?? "" }} />
			<LibraryHeaderMenu uuid={uuid} />
			<LibraryTitles key={uuid} uuid={uuid} />
		</>
	);
}
