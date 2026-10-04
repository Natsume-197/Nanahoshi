import { useLocalSearchParams } from "expo-router";
import { FixMatch } from "@/screens/detail/fix-match";

export default function FixMatchRoute() {
	const { uuid, kind } = useLocalSearchParams<{
		uuid: string;
		kind?: string;
	}>();
	return (
		<FixMatch
			key={uuid}
			uuid={uuid}
			kind={kind === "audiobook" ? "audiobook" : "book"}
		/>
	);
}
