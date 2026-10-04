import { useLocalSearchParams } from "expo-router";
import { JoinServer } from "@/screens/panels/join-server";

export default function JoinRoute() {
	const { code } = useLocalSearchParams<{ code?: string }>();
	return <JoinServer initialCode={code} />;
}
