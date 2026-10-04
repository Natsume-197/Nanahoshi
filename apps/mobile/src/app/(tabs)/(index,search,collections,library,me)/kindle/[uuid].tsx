import { useLocalSearchParams } from "expo-router";
import { SendToKindle } from "@/screens/detail/send-to-kindle";

export default function SendToKindleRoute() {
	const { uuid } = useLocalSearchParams<{ uuid: string }>();
	return <SendToKindle uuid={uuid} />;
}
