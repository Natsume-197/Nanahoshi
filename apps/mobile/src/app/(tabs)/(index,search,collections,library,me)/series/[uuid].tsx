import { useLocalSearchParams } from "expo-router";
import { SeriesDetail } from "@/screens/detail/series";

export default function SeriesRoute() {
	const { uuid, kind } = useLocalSearchParams<{
		uuid: string;
		kind?: string;
	}>();
	return (
		<SeriesDetail
			key={uuid}
			uuid={uuid}
			kind={kind === "audiobook" ? "audiobook" : "book"}
		/>
	);
}
