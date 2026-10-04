import { useLocalSearchParams } from "expo-router";
import { BookDetail } from "@/screens/detail/book";

export default function BookRoute() {
	const { uuid } = useLocalSearchParams<{ uuid: string }>();
	return <BookDetail key={uuid} uuid={uuid} />;
}
