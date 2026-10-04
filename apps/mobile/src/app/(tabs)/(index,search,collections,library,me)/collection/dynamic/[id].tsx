import { useLocalSearchParams } from "expo-router";
import { EditDynamicCollection } from "@/screens/collections/dynamic/editor";

export default function EditDynamicCollectionRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <EditDynamicCollection id={id} />;
}
