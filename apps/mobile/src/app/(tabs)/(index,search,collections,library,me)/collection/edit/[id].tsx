import { useLocalSearchParams } from "expo-router";
import { EditCollection } from "@/screens/collections/create";

export default function EditCollectionRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <EditCollection id={id} />;
}
