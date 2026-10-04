import { useLocalSearchParams } from "expo-router";
import { AudiobookDetail } from "@/screens/detail/audiobook";

export default function AudiobookRoute() {
	const { uuid } = useLocalSearchParams<{ uuid: string }>();
	return <AudiobookDetail key={uuid} uuid={uuid} />;
}
