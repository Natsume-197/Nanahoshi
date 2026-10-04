import { useLocalSearchParams } from "expo-router";
import { AuthorDetail } from "@/screens/detail/author";

export default function AuthorRoute() {
	const { uuid } = useLocalSearchParams<{ uuid: string }>();
	return <AuthorDetail key={uuid} uuid={uuid} />;
}
