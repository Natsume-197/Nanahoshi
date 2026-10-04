import { useLocalSearchParams } from "expo-router";
import { CollectionDetail } from "@/screens/collections/detail";

export default function CollectionRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <CollectionDetail key={id} id={id} />;
}
