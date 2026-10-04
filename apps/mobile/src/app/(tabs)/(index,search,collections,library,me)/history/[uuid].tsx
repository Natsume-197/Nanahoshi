import { useLocalSearchParams } from "expo-router";
import { ReadingHistoryPage } from "@/screens/detail/reading-history-page";

export default function HistoryRoute() {
	const { uuid, kind } = useLocalSearchParams<{
		uuid: string;
		kind?: string;
	}>();
	return (
		<ReadingHistoryPage
			key={uuid}
			uuid={uuid}
			kind={kind === "audiobook" ? "audiobook" : "book"}
		/>
	);
}
