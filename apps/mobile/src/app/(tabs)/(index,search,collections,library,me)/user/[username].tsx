import { useLocalSearchParams } from "expo-router";
import { Profile } from "@/screens/me";

export default function UserRoute() {
	const { username } = useLocalSearchParams<{ username: string }>();
	return <Profile key={username} username={username} />;
}
